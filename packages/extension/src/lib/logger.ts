import { getBrowserId } from "@/lib/config"
import { ServerRpcs } from "@tx/server/schema"
import { Duration, Effect, Logger } from "effect"
import { RpcClient } from "effect/unstable/rpc"

const remoteLogger = Effect.gen(function* () {
  const client = yield* RpcClient.make(ServerRpcs)
  const browserId = yield* getBrowserId()

  return yield* Logger.batched(Logger.formatSimple, {
    window: Duration.seconds(1),
    flush: (messages) =>
      client.PushLogs({ browserId, messages }).pipe(Effect.catch(() => Effect.void)),
  })
})

export const RemoteLoggerLayer = Logger.layer([remoteLogger])
