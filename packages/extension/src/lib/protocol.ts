import { Effect, Layer } from "effect";
import { RpcClient, RpcSerialization, type RpcMessage } from "effect/unstable/rpc";
import { RpcClientError, RpcClientDefect } from "effect/unstable/rpc/RpcClientError";
import { browser } from "wxt/browser";

export const MessageRpcClientLayer = Layer.effect(
  RpcClient.Protocol,
  RpcClient.Protocol.make(
    Effect.fnUntraced(function* (writeResponse) {
      const serialization = yield* RpcSerialization.RpcSerialization;
      const parser = serialization.makeUnsafe();

      const send = Effect.fnUntraced(function* (clientId: number, request: RpcMessage.FromClientEncoded) {
        if (request._tag !== "Request") {
          return;
        }

        const encoded = parser.encode(request);
        if (!encoded) return;

        const responseText = yield* Effect.tryPromise({
          try: () => browser.runtime.sendMessage(encoded) as Promise<string>,
          catch: (cause) =>
            new RpcClientError({
              reason: new RpcClientDefect({
                message: "Message failed",
                cause,
              }),
            }),
        });

        const responses = parser.decode(responseText) as Array<Parameters<typeof writeResponse>[1]>;
        for (const resp of responses) {
          yield* writeResponse(clientId, resp);
        }
      });

      return {
        send,
        supportsAck: false,
        supportsTransferables: false,
      };
    })
  )
).pipe(Layer.provideMerge(RpcSerialization.layerNdjson));


