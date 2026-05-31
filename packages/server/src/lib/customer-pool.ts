import {
  Context,
  Duration,
  Effect,
  FileSystem,
  Layer,
  Option,
  Schema,
  Stream,
  SynchronizedRef,
} from "effect"
import { Customer, CustomerDataFile, customerKey } from "../rpc/schema.ts"
import { TxConfig } from "./config.ts"

type PoolState = {
  available: ReadonlyArray<typeof Customer.Type>
  claimedKeys: Set<string>
}

export class CustomerPool extends Context.Service<CustomerPool>()("@tx/server/CustomerPool", {
  make: Effect.fn(function* () {
    const fs = yield* FileSystem.FileSystem
    const { config, paths } = yield* TxConfig

    if (config.customerDataPath.length === 0) {
      return yield* Effect.die(new Error(`customerDataPath is not set in ${paths.configFilePath}.`))
    }

    const dataPath = config.customerDataPath

    const ref = yield* SynchronizedRef.make<PoolState>({
      available: [],
      claimedKeys: new Set<string>(),
    })

    const loadFile = Effect.fn(function* () {
      const content = yield* fs.readFileString(dataPath)
      return yield* Schema.decodeUnknownEffect(CustomerDataFile)(content)
    })

    const initial = yield* loadFile().pipe(Effect.orDie)
    yield* SynchronizedRef.set(ref, { available: initial, claimedKeys: new Set<string>() })
    yield* Effect.logInfo("Customer pool loaded", initial.length, "rows from", dataPath)

    const reload = Effect.fn(function* () {
      const rows = yield* loadFile().pipe(Effect.option)
      if (Option.isNone(rows)) return

      const added = yield* SynchronizedRef.modify(ref, (state) => {
        const availableKeys = new Set(state.available.map(customerKey))
        const newRows = rows.value.filter((row) => {
          const key = customerKey(row)
          if (state.claimedKeys.has(key)) return false
          if (availableKeys.has(key)) return false
          return true
        })
        const next: PoolState = {
          available: [...state.available, ...newRows],
          claimedKeys: state.claimedKeys,
        }
        return [newRows.length, next] as const
      })

      if (added > 0) yield* Effect.logInfo("Customer pool reload added", added, "rows")
      else yield* Effect.logWarning("No new customer data loaded")
    })

    yield* Effect.forkScoped(
      fs.watch(dataPath).pipe(
        Stream.debounce(Duration.millis(300)),
        Stream.runForEach(() => reload()),
      ),
    )

    const claim = Effect.fn(function* () {
      return yield* SynchronizedRef.modify(ref, (state) => {
        const [customer, ...rest] = state.available
        if (!customer) return [null, state] as const

        const key = customerKey(customer)
        const claimedKeys = new Set(state.claimedKeys)
        claimedKeys.add(key)
        return [customer, { available: rest, claimedKeys }] as const
      })
    })

    return { claim }
  }),
}) {
  static layer = Layer.effect(this, this.make())
}
