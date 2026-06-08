import { Init } from "@/lib/init"
import { RemoteLoggerLayer } from "@/lib/logger"
import { CaptureScreenshotMsg } from "@/lib/screenshot"
import { Effect, Layer, Option, Schema } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/unstable/http"
import { RpcClient, RpcSerialization } from "effect/unstable/rpc"
import { RpcClientDefect, RpcClientError } from "effect/unstable/rpc/RpcClientError"
import { browser } from "wxt/browser"

const ForwardMsg = Schema.TaggedStruct("ForwardMsg", {
  message: Schema.String,
})

export const RpcClientLayer = Layer.effect(
  RpcClient.Protocol,
  RpcClient.Protocol.make(
    Effect.fn(function* (writeResponse) {
      const serialization = yield* RpcSerialization.RpcSerialization
      const parser = serialization.makeUnsafe()

      return {
        send: Effect.fn(function* (clientId, request) {
          if (request._tag !== "Request") {
            return
          }

          const encoded = parser.encode(request)
          if (typeof encoded !== "string") return

          const responseText = yield* Effect.tryPromise({
            try: () =>
              browser.runtime.sendMessage(
                ForwardMsg.make({
                  message: encoded,
                }),
              ) as Promise<string>,
            catch: (cause) =>
              new RpcClientError({
                reason: new RpcClientDefect({
                  message: "Message failed",
                  cause,
                }),
              }),
          })

          const responses = parser.decode(responseText) as Array<
            Parameters<typeof writeResponse>[1]
          >
          for (const resp of responses) {
            yield* writeResponse(clientId, resp)
          }
        }),
        supportsAck: false,
        supportsTransferables: false,
      }
    }),
  ),
).pipe(Layer.provideMerge(RpcSerialization.layerNdjson))

export const registerRpcTunnel = Effect.gen(function* () {
  const http = yield* HttpClient.HttpClient
  const init = yield* Init
  const context = yield* Effect.context()

  yield* Effect.sync(() => {
    browser.runtime.onMessage.addListener((message, sender) => {
      if (Schema.is(CaptureScreenshotMsg)(message)) {
        const windowId = sender.tab?.windowId
        if (windowId === undefined) {
          return Promise.reject(new Error("screenshot capture requires a content-script tab"))
        }
        return browser.tabs.captureVisibleTab(windowId, { format: "png" })
      }
      return false
    })

    browser.runtime.onMessage.addListener((message) => {
      if (!Schema.is(ForwardMsg)(message)) return false

      return Effect.gen(function* () {
        const initPayload = yield* init.get()
        if (Option.isNone(initPayload)) {
          yield* Effect.logWarning("RPC tunnel skipped — extension init not loaded")
          return
        }

        const { port } = initPayload.value
        const url = `http://localhost:${port}/rpc`

        const request = HttpClientRequest.post(url).pipe(
          HttpClientRequest.bodyText(message.message, "application/ndjson"),
        )

        return yield* http.execute(request).pipe(
          Effect.flatMap((res) => res.text),
          Effect.tapError((error) => Effect.logWarning("RPC tunnel failed", url, "—", error)),
        )
      }).pipe(Effect.provide(context), Effect.runPromise)
    })
  })
})

export const BackgroundLive = Layer.mergeAll(FetchHttpClient.layer, Init.layer)

export const ContentLive = RemoteLoggerLayer.pipe(
  Layer.provideMerge(RpcClientLayer),
  Layer.provideMerge(Init.layer),
)
