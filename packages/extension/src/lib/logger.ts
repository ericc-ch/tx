import { Config } from "@/lib/config"
import { ServerRpcs } from "@tx/server/schema"
import { Console, Duration, Effect, Logger } from "effect"
import { RpcClient } from "effect/unstable/rpc"

const remoteLogger = Effect.gen(function* () {
  const client = yield* RpcClient.make(ServerRpcs)
  const config = yield* Config
  const { browserId } = yield* config.get()

  return yield* Logger.batched(Logger.formatSimple, {
    window: Duration.seconds(1),
    flush: (messages) => client.PushLogs({ browserId, messages }).pipe(Effect.catch(Console.error)),
  })
})

export const RemoteLoggerLayer = Logger.layer([remoteLogger], { mergeWithExisting: true })
