import { BrowserRuntime } from "@effect/platform-browser"
import { Effect, Encoding, pipe, Result, Schema } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/unstable/http"
import { browser } from "wxt/browser"
import { storage } from "wxt/utils/storage"
import { INIT_PAYLOAD_PARAM } from "@tx/server/schema"
import { RpcForwardMessage } from "@/lib/protocol"

const getPort = async () => {
  const config = await storage.getItem("local:config")
  const schema = Schema.Struct({ port: Schema.Number })
  return Schema.is(schema)(config) ? config.port : undefined
}

const main = Effect.gen(function* () {
  yield* Effect.logInfo("Background service worker started")

  const httpClient = yield* HttpClient.HttpClient

  yield* Effect.sync(() => {
    browser.tabs.onUpdated.addListener(async (_tabId, changeInfo, tab) => {
      const url = changeInfo.url ?? tab.url
      if (!url) return

      const parsedUrl = new URL(url)
      const encoded = parsedUrl.searchParams.get(INIT_PAYLOAD_PARAM)
      if (!encoded) return

      const result = Encoding.decodeBase64UrlString(encoded)
      const config = Schema.decodeSync(Schema.fromJsonString(Schema.Unknown))(
        Result.getOrThrow(result),
      )

      pipe(
        () => storage.setItem("local:config", config),
        Effect.tryPromise,
        Effect.tap(() =>
          Effect.logInfo(`Captured and persisted config: ${JSON.stringify(config)}`),
        ),
        Effect.catch((err) => Effect.logError("Failed to persist config", err)),
        Effect.runFork,
      )
    })
  })

  yield* Effect.sync(() => {
    browser.runtime.onMessage.addListener((message) => {
      if (!Schema.is(RpcForwardMessage)(message)) return false

      const { message: payload } = message

      return Effect.gen(function* () {
        const port = (yield* Effect.tryPromise(() => getPort())) ?? 8211
        const url = `http://localhost:${port}/rpc`

        const request = HttpClientRequest.post(url).pipe(
          HttpClientRequest.bodyText(payload, "application/ndjson"),
        )

        const responseText = yield* httpClient.execute(request).pipe(
          Effect.flatMap((res) => res.text),
          Effect.catch((error) =>
            Effect.gen(function* () {
              yield* Effect.logError("Failed to forward message in background", error)
              return ""
            }),
          ),
        )

        return responseText
      }).pipe(Effect.runPromise)
    })
  })
})

export default defineBackground(() => {
  main.pipe(Effect.provide(FetchHttpClient.layer), BrowserRuntime.runMain)
})
