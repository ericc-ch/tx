import { Config } from "@/lib/config"
import { RemoteLoggerLayer } from "@/lib/logger"
import { Effect, Layer, Schema } from "effect"
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
  const config = yield* Config

  yield* Effect.sync(() => {
    browser.runtime.onMessage.addListener((message) => {
      if (!Schema.is(ForwardMsg)(message)) return false

      return Effect.gen(function* () {
        const { port } = yield* config.get()
        const url = `http://localhost:${port}/rpc`

        const request = HttpClientRequest.post(url).pipe(
          HttpClientRequest.bodyText(message.message, "application/ndjson"),
        )

        return yield* http.execute(request).pipe(Effect.flatMap((res) => res.text))
      }).pipe(Effect.runPromise)
    })
  })
})

export const BackgroundLive = Layer.mergeAll(FetchHttpClient.layer, Config.layer)

export const ContentLive = RemoteLoggerLayer.pipe(
  Layer.provideMerge(RpcClientLayer),
  Layer.provideMerge(Config.layer),
)
