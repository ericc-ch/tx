import { Init } from "@/lib/init"
import { ServerRpcs } from "@tx/server/schema"
import { Array, Console, Context, Duration, Effect, Layer, Logger, References } from "effect"
import { RpcClient } from "effect/unstable/rpc"

const remoteLogEntry = Logger.make(({ logLevel, message }) => ({
  level: logLevel,
  message: Array.ensure(message),
}))

const remoteLogger = Effect.gen(function* () {
  const client = yield* RpcClient.make(ServerRpcs)
  const init = yield* Init
  const { browserId } = yield* init.get()

  return yield* Logger.batched(remoteLogEntry, {
    window: Duration.seconds(1),
    flush: (entries) => client.PushLogs({ browserId, entries }).pipe(Effect.catch(Console.error)),
  })
})

export const RemoteLoggerLayer = Logger.layer([remoteLogger], { mergeWithExisting: true }).pipe(
  Layer.provideMerge(Layer.succeedContext(Context.make(References.MinimumLogLevel, "All"))),
)
