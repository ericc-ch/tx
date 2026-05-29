import { Context, Duration, Effect, FileSystem, Layer, Schema, Stream, SynchronizedRef } from "effect"
import { Customer, CustomerDataFile, customerKey, decodeCustomerRow } from "../rpc/schema.ts"

type PoolState = {
  available: Array<typeof Customer.Type>
  claimedKeys: Set<string>
}

export class CustomerPool extends Context.Service<CustomerPool>()("@tx/server/CustomerPool", {
  make: Effect.fn(function* ({ path }: { path: string }) {
    const fs = yield* FileSystem.FileSystem
    const ref = yield* SynchronizedRef.make<PoolState>({
      available: [],
      claimedKeys: new Set<string>(),
    })

    const loadFile = Effect.fn(function* () {
      const content = yield* fs.readFileString(path)
      const rows = yield* Schema.decodeUnknownEffect(CustomerDataFile)(content)
      return rows.map(decodeCustomerRow)
    })

    const initial = yield* loadFile()
    yield* SynchronizedRef.set(ref, { available: initial, claimedKeys: new Set<string>() })
    yield* Effect.logInfo("Customer pool loaded", initial.length, "rows from", path)

    const reload = Effect.fn(function* () {
      const result = yield* loadFile().pipe(Effect.result)
      if (result._tag === "Failure") {
        yield* Effect.logError("Failed to reload customer data", result.failure)
        return
      }

      const rows = result.success

      const added = yield* SynchronizedRef.modify(ref, (state) => {
        const availableKeys = new Set(state.available.map(customerKey))
        const newRows = rows.filter((row) => {
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
    })

    yield* Effect.forkScoped(
      fs.watch(path).pipe(
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
  static layer = (options: { path: string }) => Layer.effect(this, this.make(options))
}
