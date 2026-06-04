import { Effect, Formatter } from "effect"
import { CustomerPool } from "../lib/customer-pool.ts"
import { sendPaymentConfirm } from "../lib/discord-notify.ts"
import { TxConfig } from "../lib/config.ts"
import { ServerRpcs } from "./schema.ts"

export const RpcHandlers = ServerRpcs.toLayer(
  Effect.gen(function* () {
    const pool = yield* CustomerPool
    const { config } = yield* TxConfig
    const poolEmptyLoggedForBrowser = new Set<string>()

    return ServerRpcs.of({
      ClaimCustomer: ({ browserId }) =>
        Effect.gen(function* () {
          const customer = yield* pool.claim(browserId)
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
      ResolveCustomer: ({ browserId, customerKey: key, outcome, reason }) =>
        Effect.gen(function* () {
          const resolved = yield* pool.resolve(browserId, key)
          if (!resolved) return

          yield* Effect.logInfo("Browser", browserId, outcome, "customer", key, "—", reason)
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
      ReportPaymentConfirm: ({
        browserId,
        virtualAccount,
        customerEmail,
        paymentMethod,
        screenshotBase64,
      }) =>
        Effect.gen(function* () {
          const webhookUrl = config.discordWebhookUrl?.trim()
          if (!webhookUrl) {
            yield* Effect.logDebug("discordWebhookUrl not set, skipping payment notify")
            return
          }

          yield* Effect.logDebug(
            "Payment notify sending",
            browserId,
            customerEmail,
            paymentMethod,
            virtualAccount,
          )

          yield* sendPaymentConfirm({
            webhookUrl,
            virtualAccount,
            customerEmail,
            paymentMethod,
            screenshotBase64,
          })

          yield* Effect.logInfo("Payment notify sent", browserId, customerEmail, virtualAccount)
        }).pipe(
          Effect.tapError((error) =>
            Effect.logError("Payment notify failed", browserId, customerEmail, error),
          ),
          Effect.orDie,
        ),
    })
  }),
)
