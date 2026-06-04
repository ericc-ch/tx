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
  assigned: Map<string, typeof Customer.Type>
  settled: Set<string>
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
      assigned: new Map(),
      settled: new Set<string>(),
    })

    const loadFile = Effect.fn(function* () {
      const content = yield* fs.readFileString(dataPath)
      const rows = yield* Schema.decodeUnknownEffect(CustomerDataFile)(content)
      return rows
    })

    const initial = yield* loadFile().pipe(Effect.orDie)
    yield* SynchronizedRef.set(ref, {
      available: initial,
      assigned: new Map(),
      settled: new Set<string>(),
    })
    yield* Effect.logInfo("Customer pool loaded", initial.length, "rows from", dataPath)

    const reload = Effect.fn(function* () {
      const rows = yield* loadFile().pipe(
        Effect.tapError((cause) =>
          Effect.logWarning("Customer pool reload failed", dataPath, cause),
        ),
        Effect.option,
      )
      if (Option.isNone(rows)) return

      const added = yield* SynchronizedRef.modify(ref, (state) => {
        const availableKeys = new Set(state.available.map(customerKey))
        const inFlight = new Set([...state.assigned.values()].map(customerKey))
        const newRows = rows.value.filter((row) => {
          const key = customerKey(row)
          if (state.settled.has(key)) return false
          if (inFlight.has(key)) return false
          if (availableKeys.has(key)) return false
          return true
        })
        const next: PoolState = {
          available: [...state.available, ...newRows],
          assigned: state.assigned,
          settled: state.settled,
        }
        return [newRows.length, next] as const
      })

      if (added > 0)
        yield* Effect.logInfo("Customer pool reload added", added, "rows from", dataPath)
      else yield* Effect.logDebug("No new customer data loaded")
    })

    yield* Effect.forkScoped(
      fs.watch(dataPath).pipe(
        Stream.debounce(Duration.millis(300)),
        Stream.runForEach(() => reload()),
      ),
    )

    const claim = Effect.fn(function* (browserId: string) {
      return yield* SynchronizedRef.modify(ref, (state) => {
        const existing = state.assigned.get(browserId)
        if (existing) return [existing, state] as const

        const [customer, ...rest] = state.available
        if (!customer) return [null, state] as const

        const assigned = new Map(state.assigned)
        assigned.set(browserId, customer)
        return [customer, { ...state, available: rest, assigned }] as const
      })
    })

    const resolve = Effect.fn(function* (browserId: string, key: string) {
      return yield* SynchronizedRef.modify(ref, (state) => {
        if (state.settled.has(key)) return [false, state] as const

        const customer = state.assigned.get(browserId)
        if (!customer || customerKey(customer) !== key) return [false, state] as const

        const assigned = new Map(state.assigned)
        assigned.delete(browserId)
        const settled = new Set(state.settled)
        settled.add(key)
        return [true, { ...state, assigned, settled }] as const
      })
    })

    return { claim, resolve }
  }),
}) {
  static layer = Layer.effect(this, this.make())
}
