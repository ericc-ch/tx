import { customerKey, OperatorRpcs } from "@tx/schema"
import { Effect, Formatter } from "effect"
import { TxConfig } from "../lib/config.ts"
import { Discord } from "../lib/discord.ts"
import { discordWebhook } from "../lib/discord-webhook.ts"
import { PoolUpstream } from "../lib/pool-upstream.ts"
import { SessionMap } from "../lib/session-map.ts"

export const OperatorRpcHandlers = OperatorRpcs.toLayer(
  Effect.gen(function* () {
    const pool = yield* PoolUpstream
    const sessions = yield* SessionMap
    const { discordWebhookUrl } = yield* TxConfig
    const discord = yield* Discord
    const poolEmptyLoggedForBrowser = new Set<string>()

    return OperatorRpcs.of({
      ClaimCustomer: ({ browserId }) =>
        Effect.gen(function* () {
          const existing = sessions.get(browserId)
          if (existing) return { customer: existing }

          const response = yield* pool.claimNext().pipe(
            Effect.tapError((error) =>
              Effect.logWarning("Pool claim failed for", browserId, error),
            ),
            Effect.orDie,
          )
          if ("empty" in response) {
            if (!poolEmptyLoggedForBrowser.has(browserId)) {
              poolEmptyLoggedForBrowser.add(browserId)
              yield* Effect.logInfo("Customer pool empty", browserId)
            }
            return { empty: true as const }
          }

          poolEmptyLoggedForBrowser.delete(browserId)
          sessions.set(browserId, response.customer)
          yield* Effect.logInfo("Browser", browserId, "claimed customer", response.customer.email)
          return { customer: response.customer }
        }),
      ResolveCustomer: ({ browserId, customerKey: key, outcome, reason }) =>
        Effect.gen(function* () {
          const customer = sessions.get(browserId)
          if (!customer || customerKey(customer) !== key) {
            yield* Effect.logWarning("Resolve ignored for", browserId, key)
            return
          }

          yield* pool.resolve({ customerKey: key, outcome }).pipe(
            Effect.tapError((error) => Effect.logWarning("Pool resolve failed", key, error)),
            Effect.ignore,
          )
          sessions.remove(browserId)
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

          yield* discord.execute(discordWebhookUrl, message)
          yield* Effect.logInfo("Payment notify sent", browserId, customerEmail, virtualAccount)
        }).pipe(
          Effect.tapError((error) =>
            Effect.logError("Payment notify failed", browserId, customerEmail, error),
          ),
          Effect.orDie,
        ),
      ReportQueueAlert: ({ browserId, transferUrl }) =>
        Effect.gen(function* () {
          yield* discord.execute(discordWebhookUrl, discordWebhook().content(transferUrl).build())
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
