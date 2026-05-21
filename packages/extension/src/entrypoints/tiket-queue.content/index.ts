import { RpcClientLayer } from "@/lib/rpc"
import { BrowserRuntime } from "@effect/platform-browser"
import { ServerRpcs } from "@tiket-tools/server/protocol"
import { Duration, Effect, Schedule } from "effect"
import { RpcClient } from "effect/unstable/rpc"
import { readPeopleAhead } from "./parse"

const getBrowserId = () => {
  const urlParams = new URLSearchParams(window.location.search)
  return urlParams.get("__browser_id") ?? "unknown"
}

const reportQueuePosition = Effect.gen(function* () {
  const client = yield* RpcClient.make(ServerRpcs)
  const browserId = getBrowserId()

  yield* Effect.logInfo(`Starting queue position reporter for browser: ${browserId}`)

  const position = yield* Effect.sync(() => readPeopleAhead()).pipe(
    Effect.tap((pos) =>
      pos
        ? Effect.logInfo(`Found queue position: ${pos.peopleAhead}`)
        : Effect.logDebug("Queue position not found, retrying..."),
    ),
    Effect.repeat({
      until: (pos): pos is { peopleAhead: number } => pos !== undefined,
      schedule: Schedule.spaced(Duration.millis(100)),
    }),
  )

  yield* Effect.logInfo(`Reporting queue position: ${position.peopleAhead}`)
  const ack = yield* client.ReportQueuePosition({
    peopleAhead: position.peopleAhead,
    browserId,
  })
  yield* Effect.logInfo(
    `Queue report acknowledged (threshold ${ack.threshold}, closed ${ack.closed})`,
  )
}).pipe(Effect.scoped)

export default defineContentScript({
  matches: ["*://queue.tiket.com/*", "*://localhost/*"],
  main() {
    reportQueuePosition.pipe(Effect.provide(RpcClientLayer), BrowserRuntime.runMain)
  },
})
