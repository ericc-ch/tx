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
import { Customer, CustomerDataFile, customerKey } from "@tx/schema"
import { PoolConfig } from "./config.ts"

type PoolState = {
  available: ReadonlyArray<typeof Customer.Type>
  inFlight: Map<string, typeof Customer.Type>
  settled: Set<string>
}

export class CustomerPool extends Context.Service<CustomerPool>()("@tx/pool/CustomerPool", {
  make: Effect.fn(function* () {
    const fs = yield* FileSystem.FileSystem
    const { claimTtl, customerDataPath } = yield* PoolConfig

    if (customerDataPath.length === 0) {
      return yield* Effect.die(new Error("customerDataPath is not set"))
    }

    const ref = yield* SynchronizedRef.make<PoolState>({
      available: [],
      inFlight: new Map(),
      settled: new Set<string>(),
    })

    const loadFile = Effect.fn(function* () {
      const content = yield* fs.readFileString(customerDataPath)
      const rows = yield* Schema.decodeUnknownEffect(CustomerDataFile)(content)
      return rows
    })

    const initial = yield* loadFile().pipe(Effect.orDie)
    yield* SynchronizedRef.set(ref, {
      available: initial,
      inFlight: new Map(),
      settled: new Set<string>(),
    })
    yield* Effect.logInfo("Customer pool loaded", initial.length, "rows from", customerDataPath)

    const reload = Effect.fn(function* () {
      const rows = yield* loadFile().pipe(
        Effect.tapError((cause) =>
          Effect.logWarning("Customer pool reload failed", customerDataPath, cause),
        ),
        Effect.option,
      )
      if (Option.isNone(rows)) return

      const added = yield* SynchronizedRef.modify(ref, (state) => {
        const availableKeys = new Set(state.available.map(customerKey))
        const inFlightKeys = new Set(state.inFlight.keys())
        const newRows = rows.value.filter((row) => {
          const key = customerKey(row)
          if (state.settled.has(key)) return false
          if (inFlightKeys.has(key)) return false
          if (availableKeys.has(key)) return false
          return true
        })
        const next: PoolState = {
          available: [...state.available, ...newRows],
          inFlight: state.inFlight,
          settled: state.settled,
        }
        return [newRows.length, next] as const
      })

      if (added > 0)
        yield* Effect.logInfo("Customer pool reload added", added, "rows from", customerDataPath)
      else yield* Effect.logDebug("No new customer data loaded")
    })

    yield* Effect.forkScoped(
      fs.watch(customerDataPath).pipe(
        Stream.debounce(Duration.millis(300)),
        Stream.runForEach(() => reload()),
      ),
    )

    const releaseClaimIfStillInFlight = Effect.fn(function* (key: string) {
      yield* Effect.sleep(claimTtl)
      yield* SynchronizedRef.modify(ref, (state) => {
        const customer = state.inFlight.get(key)
        if (!customer) return [false, state] as const

        const inFlight = new Map(state.inFlight)
        inFlight.delete(key)
        return [true, { ...state, inFlight, available: [...state.available, customer] }] as const
      }).pipe(
        Effect.tap((released) =>
          released
            ? Effect.logWarning("Claim TTL expired, returned customer to pool", key)
            : Effect.void,
        ),
      )
    })

    const claimNext = Effect.fn(function* () {
      const customer = yield* SynchronizedRef.modify(ref, (state) => {
        const [next, ...rest] = state.available
        if (!next) return [null, state] as const

        const key = customerKey(next)
        const inFlight = new Map(state.inFlight)
        inFlight.set(key, next)
        return [next, { ...state, available: rest, inFlight }] as const
      })
      if (customer) {
        yield* Effect.forkScoped(releaseClaimIfStillInFlight(customerKey(customer)))
      }
      return customer
    })

    const resolve = Effect.fn(function* (key: string, outcome: "finished" | "discarded") {
      return yield* SynchronizedRef.modify(ref, (state) => {
        if (state.settled.has(key)) return [false, state] as const
        if (!state.inFlight.has(key)) return [false, state] as const

        const inFlight = new Map(state.inFlight)
        inFlight.delete(key)
        const settled = new Set(state.settled)
        settled.add(key)
        return [true, { ...state, inFlight, settled }] as const
      }).pipe(
        Effect.tap((resolved) =>
          resolved ? Effect.logInfo("Customer", key, outcome) : Effect.void,
        ),
      )
    })

    return { claimNext, resolve }
  }),
}) {
  static layer = Layer.effect(this, this.make())
}
