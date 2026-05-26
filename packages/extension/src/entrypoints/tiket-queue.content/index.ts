import { Config } from "@/lib/config"
import { ContentLive } from "@/lib/rpc"
import { BrowserRuntime } from "@effect/platform-browser"
import { ServerRpcs } from "@tx/server/schema"
import { Duration, Effect, Schedule } from "effect"
import { RpcClient } from "effect/unstable/rpc"
import { readPeopleAhead } from "./parse"

const main = Effect.gen(function* () {
  const client = yield* RpcClient.make(ServerRpcs)

  yield* Effect.logInfo("Starting queue position reporter")

  const config = yield* Config
  const { browserId } = yield* config.get()

  const position = yield* Effect.sync(() => readPeopleAhead()).pipe(
    Effect.tap((read) =>
      read.peopleAhead !== undefined
        ? Effect.logInfo(`Queue read OK: ${read.summary}`)
        : Effect.logInfo(`Queue read failed: ${read.summary}`),
    ),
    Effect.repeat({
      until: (read) => read.peopleAhead !== undefined,
      schedule: Schedule.spaced(Duration.millis(20)),
    }),
  )

  yield* Effect.logInfo(`Reporting queue position ${position.peopleAhead} (${position.summary})`)

  yield* client
    .ReportQueuePosition({
      peopleAhead: position.peopleAhead,
      browserId,
    })
    .pipe(
      Effect.tap((ack) =>
        Effect.logInfo(
          `Queue report OK: peopleAhead=${position.peopleAhead}, threshold=${ack.threshold}, closed=${ack.closed} (${position.summary})`,
        ),
      ),
      Effect.tapError((cause) =>
        Effect.logError(
          `Queue report failed: peopleAhead=${position.peopleAhead} (${position.summary})`,
          cause,
        ),
      ),
    )
}).pipe(Effect.scoped)

export default defineContentScript({
  matches: ["*://queue.tiket.com/*", "*://localhost/*"],
  main() {
    main.pipe(Effect.provide(ContentLive), BrowserRuntime.runMain)
  },
})
