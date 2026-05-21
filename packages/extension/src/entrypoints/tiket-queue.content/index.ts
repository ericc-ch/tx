import { RpcClientLayer } from "@/lib/rpc"
import { BrowserRuntime } from "@effect/platform-browser"
import { ServerRpcs } from "@tiket-tools/server/protocol"
import { Duration, Effect, Schedule } from "effect"
import { RpcClient } from "effect/unstable/rpc"
import { readPeopleAhead } from "./parse"
import { getBrowserId } from "@/lib/id"

const logQueueRead = (read: ReturnType<typeof readPeopleAhead>) =>
  read.peopleAhead !== undefined
    ? Effect.logInfo(`Queue read OK: ${read.summary}`)
    : Effect.logInfo(`Queue read failed: ${read.summary}`)

const main = Effect.gen(function* () {
  const client = yield* RpcClient.make(ServerRpcs)
  const browserId = getBrowserId()

  yield* Effect.logInfo(`Starting queue position reporter for browser: ${browserId}`)

  const position = yield* Effect.sync(() => readPeopleAhead()).pipe(
    Effect.tap(logQueueRead),
    Effect.repeat({
      until: (read) => read.peopleAhead !== undefined,
      schedule: Schedule.spaced(Duration.millis(20)),
    }),
  )

  yield* Effect.logInfo(
    `Reporting queue position ${position.peopleAhead} (${position.summary})`,
  )

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
    main.pipe(Effect.provide(RpcClientLayer), BrowserRuntime.runMain)
  },
})
