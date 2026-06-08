import { Effect, Formatter } from "effect"
import { TxConfig } from "../lib/config.ts"
import { Discord } from "../lib/discord.ts"
import { discordWebhook, type WebhookMessage } from "../lib/discord-webhook.ts"
import { CustomerPool } from "../lib/customer-pool.ts"
import { ServerRpcs } from "./schema.ts"

export const RpcHandlers = ServerRpcs.toLayer(
  Effect.gen(function* () {
    const pool = yield* CustomerPool
    const { discordWebhookUrl } = yield* TxConfig
    const discord = yield* Discord
    const poolEmptyLoggedForBrowser = new Set<string>()

    const sendWebhook = (message: WebhookMessage) =>
      discord.execute(discordWebhookUrl, message)

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
          yield* Effect.logDebug(
            "Payment notify sending",
            browserId,
            customerEmail,
            paymentMethod,
            virtualAccount,
          )

          const message = discordWebhook()
            .embed({
              fields: [
                { name: "Email", value: customerEmail },
                { name: "Payment", value: paymentMethod },
                { name: "VA", value: virtualAccount },
              ],
              image: { url: "attachment://payment.png" },
            })
            .file("payment.png", Buffer.from(screenshotBase64, "base64"), "image/png")
            .build()

          yield* sendWebhook(message)
          yield* Effect.logInfo("Payment notify sent", browserId, customerEmail, virtualAccount)
        }).pipe(
          Effect.tapError((error) =>
            Effect.logError("Payment notify failed", browserId, customerEmail, error),
          ),
          Effect.orDie,
        ),
      ReportQueueAlert: ({ browserId, transferUrl }) =>
        Effect.gen(function* () {
          yield* sendWebhook(discordWebhook().content(transferUrl).build())
          yield* Effect.logInfo("Queue alert sent", browserId, transferUrl)
        }).pipe(
          Effect.tapError((error) =>
            Effect.logError("Queue alert failed", browserId, transferUrl, error),
          ),
          Effect.orDie,
        ),
    })
  }),
)
