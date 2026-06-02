import { Init } from "@/lib/init"
import { ServerRpcs } from "@tx/server/schema"
import { Array, Context, Duration, Effect, Layer, Logger, Option, References } from "effect"
import { RpcClient } from "effect/unstable/rpc"

const remoteLogEntry = Logger.make(({ logLevel, message }) => ({
  level: logLevel,
  message: Array.ensure(message),
}))

const remoteLogger = Effect.gen(function* () {
  const init = yield* Init
  const initPayload = yield* init.get()
  if (Option.isNone(initPayload)) {
    return Logger.make(() => Effect.void)
  }

  const client = yield* RpcClient.make(ServerRpcs)
  const { browserId } = initPayload.value

  return yield* Logger.batched(remoteLogEntry, {
    window: Duration.seconds(2),
    flush: (entries) =>
      client.PushLogs({ browserId, entries }).pipe(
        Effect.tapError((error) => Effect.logWarning("PushLogs failed for", browserId, "—", error)),
        Effect.catch(() => Effect.void),
      ),
  })
})

export const RemoteLoggerLayer = Logger.layer([remoteLogger], { mergeWithExisting: true }).pipe(
  Layer.provideMerge(Layer.succeedContext(Context.make(References.MinimumLogLevel, "All"))),
)
