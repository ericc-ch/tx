import { Effect } from "effect"
import { ServerRpcs } from "./protocol.ts"

export const RpcHandlers = ServerRpcs.toLayer(
  Effect.succeed(
    ServerRpcs.of({
      ReportQueuePosition: ({ peopleAhead }) =>
        Effect.logInfo(`Queue: ${peopleAhead} people ahead`),
    }),
  ),
)
