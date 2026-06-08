import type { WebhookMessage } from "./discord-webhook.ts"
import { Context, Data, Effect, Layer } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/unstable/http"

export class DiscordError extends Data.TaggedError("DiscordError")<{
  readonly cause: unknown
}> {}

const webhookRequest = (url: string, message: WebhookMessage) => {
  if (message.files.length === 0) {
    return HttpClientRequest.post(url).pipe(HttpClientRequest.bodyJsonUnsafe(message.payload))
  }

  const entries: Record<string, string | File> = {
    payload_json: JSON.stringify(message.payload),
  }
  for (const [index, file] of message.files.entries()) {
    entries[`files[${index}]`] = new File([Buffer.from(file.data)], file.name, {
      type: file.contentType ?? "application/octet-stream",
    })
  }

  return HttpClientRequest.post(url).pipe(HttpClientRequest.bodyFormDataRecord(entries))
}

export class Discord extends Context.Service<Discord>()("@tx/server/Discord", {
  make: Effect.fn(function* () {
    const client = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk)

    const execute = Effect.fn("Discord.execute")(function* (url: string, message: WebhookMessage) {
      yield* webhookRequest(url, message).pipe(
        client.execute,
        Effect.flatMap((response) => response.arrayBuffer),
        Effect.asVoid,
        Effect.mapError((cause) => new DiscordError({ cause })),
      )
    })

    return { execute }
  }),
}) {
  static layer = Layer.effect(this, this.make()).pipe(Layer.provide(FetchHttpClient.layer))
}
