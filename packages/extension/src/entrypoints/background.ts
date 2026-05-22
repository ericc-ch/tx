import { BrowserRuntime } from "@effect/platform-browser"
import { Effect, Encoding, Option, Result, Schema } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/unstable/http"
import { browser } from "wxt/browser"
import { storage } from "wxt/utils/storage"
import { INIT_PAYLOAD_PARAM } from "@tx/server/schema"

const captureConfigFromUrl = (urlStr: string) => {
  try {
    const url = new URL(urlStr)
    const encoded = url.searchParams.get(INIT_PAYLOAD_PARAM)
    if (!encoded) return null

    const result = Encoding.decodeBase64UrlString(encoded)
    if (Result.isSuccess(result)) {
      return Schema.decodeSync(Schema.fromJsonString(Schema.Unknown))(result.success)
    }
    return null
  } catch {
    return null
  }
}

const persistConfig = async (config: unknown) => {
  await storage.setItem("local:config", config)
}

const getPort = async () => {
  const config = await storage.getItem("local:config")
  return Schema.decodeUnknownOption(Schema.Struct({ port: Schema.Number }))(config).pipe(
    Option.map((c) => c.port),
    Option.getOrUndefined,
  )
}

const main = Effect.gen(function* () {
  yield* Effect.logInfo("Background service worker started")

  const httpClient = yield* HttpClient.HttpClient

  yield* Effect.sync(() => {
    browser.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
      const url = changeInfo.url || tab.url
      if (url) {
        const config = captureConfigFromUrl(url)
        if (config) {
          Effect.tryPromise(() => persistConfig(config)).pipe(
            Effect.tap(() =>
              Effect.logInfo(`Captured and persisted config: ${JSON.stringify(config)}`),
            ),
            Effect.catch((err) => Effect.logError("Failed to persist config", err)),
            Effect.runFork,
          )
        }
      }
    })
  })

  yield* Effect.sync(() => {
    browser.runtime.onMessage.addListener((wire, _sender, sendResponse) => {
      if (typeof wire !== "string") return

      const runMessageForwarding = Effect.gen(function* () {
        const port = (yield* Effect.tryPromise(() => getPort())) ?? 8211
        const dynamicRpcUrl = `http://127.0.0.1:${port}/rpc`

        const request = HttpClientRequest.post(dynamicRpcUrl).pipe(
          HttpClientRequest.bodyText(wire, "application/ndjson"),
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

        sendResponse(responseText || undefined)
      })

      // Run the message forwarding fiber in the background
      Effect.runFork(runMessageForwarding)

      return true // Keep sendResponse open for async response
    })
  })
})

export default defineBackground(() => {
  main.pipe(Effect.provide(FetchHttpClient.layer), BrowserRuntime.runMain)
})
