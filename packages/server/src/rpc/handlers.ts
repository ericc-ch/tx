import { Effect, Formatter } from "effect"
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
      PushLogs: ({ browserId, entries }) =>
        Effect.forEach(
          entries,
          (entry) => {
            const line = `[${browserId}] ${entry.message.map((part) => (typeof part === "string" ? part : Formatter.format(part))).join(" ")}`
            switch (entry.level) {
              case "Fatal":
                return Effect.logFatal(line)
              case "Error":
                return Effect.logError(line)
              case "Warn":
                return Effect.logWarning(line)
              case "Debug":
                return Effect.logDebug(line)
              case "Trace":
                return Effect.logTrace(line)
              default:
                return Effect.logInfo(line)
            }
          },
          { discard: true },
        ),
    })
  }),
)
