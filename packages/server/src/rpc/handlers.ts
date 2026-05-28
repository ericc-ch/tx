import { Context, Effect } from "effect"
import { ServerRpcs } from "./schema.ts"
import { BrowserManager } from "../lib/browser.ts"

export class ServerConfig extends Context.Service<
  ServerConfig,
  {
    readonly threshold: number
  }
>()("@tx/server/ServerConfig") {}

export const RpcHandlers = ServerRpcs.toLayer(
  Effect.gen(function* () {
    const browserManager = yield* BrowserManager
    const config = yield* ServerConfig

    return ServerRpcs.of({
      ReportQueuePosition: ({ peopleAhead, browserId }) =>
        Effect.gen(function* () {
          yield* Effect.logInfo("Browser", browserId, "reported queue:", peopleAhead)
          const closed = peopleAhead > config.threshold
          if (closed) {
            yield* Effect.logWarning(
              "Closing browser",
              browserId,
              "because queue",
              peopleAhead,
              "exceeds threshold",
              config.threshold,
            )
            yield* browserManager.kill(browserId)
          }
          return { peopleAhead, threshold: config.threshold, closed }
        }),
      PushLogs: ({ browserId, messages }) =>
        Effect.forEach(messages, (msg) => Effect.logInfo(`[${browserId}]`, msg), {
          discard: true,
        }),
    })
  }),
)
