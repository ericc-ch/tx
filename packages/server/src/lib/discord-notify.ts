import { WebhookClient } from "discord.js"
import { Data, Effect } from "effect"

export class DiscordNotifyError extends Data.TaggedError("DiscordNotifyError")<{
  readonly cause: unknown
}> {}

export const sendPaymentConfirm = Effect.fn("sendPaymentConfirm")(function* (input: {
  readonly webhookUrl: string
  readonly virtualAccount: string
  readonly customerEmail: string
  readonly paymentMethod: string
  readonly screenshotBase64: string
}) {
  const client = yield* Effect.acquireRelease(
    Effect.sync(() => new WebhookClient({ url: input.webhookUrl })),
    (client) => Effect.sync(() => client.destroy()),
  )

  const screenshot = yield* Effect.sync(() => Buffer.from(input.screenshotBase64, "base64"))

  yield* Effect.tryPromise({
    try: () =>
      client.send({
        embeds: [
          {
            fields: [
              { name: "Email", value: input.customerEmail },
              { name: "Payment", value: input.paymentMethod },
              { name: "VA", value: input.virtualAccount },
            ],
            image: { url: "attachment://payment.png" },
          },
        ],
        files: [{ attachment: screenshot, name: "payment.png" }],
      }),
    catch: (cause) => new DiscordNotifyError({ cause }),
  })
})
