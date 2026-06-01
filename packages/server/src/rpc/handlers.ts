import { Effect, Formatter } from "effect"
import { CustomerPool } from "../lib/customer-pool.ts"
import { ServerRpcs } from "./schema.ts"

export const RpcHandlers = ServerRpcs.toLayer(
  Effect.gen(function* () {
    const pool = yield* CustomerPool
    const poolEmptyLoggedForBrowser = new Set<string>()

    return ServerRpcs.of({
      ClaimCustomer: ({ browserId }) =>
        Effect.gen(function* () {
          const customer = yield* pool.claim()
          if (!customer) {
            if (!poolEmptyLoggedForBrowser.has(browserId)) {
              poolEmptyLoggedForBrowser.add(browserId)
              yield* Effect.logInfo("Customer pool empty", browserId)
            }
            return { empty: true as const }
          }
          poolEmptyLoggedForBrowser.delete(browserId)
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
