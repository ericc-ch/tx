import { Effect } from "effect"
import { CustomerPool } from "../lib/customer-pool.ts"
import { ServerRpcs } from "./schema.ts"

export const RpcHandlers = ServerRpcs.toLayer(
  Effect.gen(function* () {
    const pool = yield* CustomerPool

    return ServerRpcs.of({
      ClaimCustomer: ({ browserId }) =>
        Effect.gen(function* () {
          const customer = yield* pool.claim()
          if (!customer) {
            yield* Effect.logInfo("Customer pool empty for browser", browserId)
            return { empty: true as const }
          }
          yield* Effect.logInfo("Browser", browserId, "claimed customer", customer.email)
          return { customer }
        }),
      PushLogs: ({ browserId, messages }) =>
        Effect.forEach(messages, (msg) => Effect.logInfo(`[${browserId}]`, msg), {
          discard: true,
        }),
    })
  }),
)
