import { Init } from "@/lib/init"
import { ServerRpcs } from "@tx/server/schema"
import { Array, Duration, Effect, Layer, Logger, Option, References } from "effect"
import { RpcClient } from "effect/unstable/rpc"

const remoteLogEntry = Logger.make(({ logLevel, message }) => ({
  level: logLevel,
  message: Array.ensure(message),
}))

const remoteLogger = Effect.gen(function* () {
  const init = yield* Init
  const initPayload = yield* init.get()
  const defaultMinimumLogLevel = yield* References.MinimumLogLevel

  const minimumLogLevel =
    initPayload.pipe(Option.map((p) => p.minimumLogLevel), Option.getOrUndefined) ??
    defaultMinimumLogLevel

  const withLogLevel = (logger: Logger.Logger<unknown, void>) =>
    Logger.layer([logger], { mergeWithExisting: true }).pipe(
      Layer.provideMerge(Layer.succeed(References.MinimumLogLevel, minimumLogLevel)),
    )

  if (Option.isNone(initPayload)) {
    return withLogLevel(Logger.make(() => Effect.void))
  }

  const client = yield* RpcClient.make(ServerRpcs)
  const { browserId } = initPayload.value

  const logger = yield* Logger.batched(remoteLogEntry, {
    window: Duration.seconds(2),
    flush: Effect.fn(function* (entries) {
      yield* client.PushLogs({ browserId, entries }).pipe(
        Effect.tapError((error) => Effect.logWarning("PushLogs failed for", browserId, "—", error)),
        Effect.catch(() => Effect.void),
      )
    }),
  })

  return withLogLevel(logger)
})

export const RemoteLoggerLayer = Layer.unwrap(remoteLogger)
