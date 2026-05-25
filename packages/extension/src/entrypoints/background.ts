import { getPort, persistConfig } from "@/lib/config"
import { initPayloadFromUrl } from "@/lib/init"
import { RpcForwardMessage } from "@/lib/protocol"
import { BrowserRuntime } from "@effect/platform-browser"
import { Effect, Option, Schema, pipe } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/unstable/http"
import { browser } from "wxt/browser"

const main = Effect.gen(function* () {
  yield* Effect.logInfo("Background service worker started")

  const httpClient = yield* HttpClient.HttpClient

  yield* Effect.sync(() => {
    browser.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
      const url = changeInfo.url ?? tab.url
      if (!url) return

      pipe(
        initPayloadFromUrl(url),
        Effect.flatMap((payload) =>
          Option.match(payload, {
            onNone: () => Effect.void,
            onSome: (config) =>
              persistConfig(config).pipe(
                Effect.tap(() =>
                  Effect.logInfo(`Captured and persisted config: ${JSON.stringify(config)}`),
                ),
              ),
          }),
        ),
        Effect.runFork,
      )
    })
  })

  yield* Effect.sync(() => {
    browser.runtime.onMessage.addListener((message) => {
      if (!Schema.is(RpcForwardMessage)(message)) return false

      const { message: payload } = message

      return Effect.gen(function* () {
        const port = yield* getPort()
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
