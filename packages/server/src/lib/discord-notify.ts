import { Data, Effect } from "effect"

const WEBHOOK_TIMEOUT_MS = 30_000

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
  const screenshot = yield* Effect.sync(() => Buffer.from(input.screenshotBase64, "base64"))

  yield* Effect.tryPromise({
    async try() {
      const form = new FormData()
      form.append(
        "payload_json",
        JSON.stringify({
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
        }),
      )
      form.append("files[0]", new Blob([screenshot], { type: "image/png" }), "payment.png")

      const response = await fetch(input.webhookUrl, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      })

      if (!response.ok) {
        throw new Error(`Discord webhook ${response.status}: ${await response.text()}`)
      }
    },
    catch: (cause) => new DiscordNotifyError({ cause }),
  })
})
