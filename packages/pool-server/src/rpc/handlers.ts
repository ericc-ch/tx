import { PoolRpcs } from "@tx/schema"
import { Effect } from "effect"
import { CustomerPool } from "../lib/customer-pool.ts"

export const PoolRpcHandlers = PoolRpcs.toLayer(
  Effect.gen(function* () {
    const pool = yield* CustomerPool

    return PoolRpcs.of({
      ClaimNext: () =>
        Effect.gen(function* () {
          const customer = yield* pool.claimNext()
          if (!customer) return { empty: true as const }
          yield* Effect.logDebug("Claimed customer", customer.email)
          return { customer }
        }),
      Resolve: ({ customerKey: key, outcome }) =>
        Effect.gen(function* () {
          const resolved = yield* pool.resolve(key, outcome)
          if (!resolved) yield* Effect.logWarning("Resolve ignored for unknown customer", key)
        }),
    })
  }),
)
