import { Init } from "@/lib/init"
import { ContentLive } from "@/lib/rpc"
import { makePersistedStore } from "@/lib/storage"
import { ServerRpcs } from "@tx/server/schema"
import { BrowserRuntime } from "@effect/platform-browser"
import { Duration, Effect, Option, Schedule, Schema } from "effect"
import { RpcClient } from "effect/unstable/rpc"

const QUEUE_THRESHOLD = 1000
const pollSchedule = Schedule.spaced(Duration.seconds(5))

const notifiedQueueStore = makePersistedStore({
  key: "local:queue-notified",
  schema: Schema.String,
})

const program = Effect.gen(function* () {
  const queueId = new URL(location.href).searchParams.get("q") ?? location.href
  const notified = yield* notifiedQueueStore.get()
  if (Option.exists(notified, (value) => value === queueId)) {
    yield* Effect.logDebug("Queue alert already sent", queueId)
    return
  }

  const client = yield* RpcClient.make(ServerRpcs)

  yield* Effect.logDebug("Waiting for queue number")
  let queueNumber = yield* Effect.sync(() => {
    const text =
      document.getElementById("MainPart_lbQueueNumber")?.textContent?.trim().replace(/,/g, "") ??
      ""
    const parsed = Number.parseInt(text, 10)
    return Number.isFinite(parsed) ? parsed : ("pending" as const)
  }).pipe(
    Effect.repeat({
      until: (result) => result !== "pending",
      schedule: pollSchedule,
    }),
  )
  yield* Effect.logInfo("Queue number assigned", queueNumber)

  if (queueNumber >= QUEUE_THRESHOLD) {
    yield* Effect.logDebug("Queue number above threshold, waiting", queueNumber, QUEUE_THRESHOLD)
    queueNumber = yield* Effect.sync(() => {
      const text =
        document.getElementById("MainPart_lbQueueNumber")?.textContent?.trim().replace(/,/g, "") ??
        ""
      const parsed = Number.parseInt(text, 10)
      if (!Number.isFinite(parsed) || parsed >= QUEUE_THRESHOLD) return "pending" as const
      return parsed
    }).pipe(
      Effect.repeat({
        until: (result) => result !== "pending",
        schedule: pollSchedule,
      }),
    )
  }

  const browserId = yield* Effect.gen(function* () {
    const init = yield* Init
    const initPayload = yield* init.get()
    if (Option.isNone(initPayload)) return "pending" as const
    return initPayload.value.browserId
  }).pipe(
    Effect.repeat({
      until: (result) => result !== "pending",
      schedule: pollSchedule,
    }),
  )

  const transferUrl =
    document.getElementById("queueIdLinkURL")?.textContent?.trim() || location.href

  yield* client.ReportQueueAlert({ browserId, transferUrl })
  yield* notifiedQueueStore.set(queueId)
  yield* Effect.logInfo("Queue alert sent", queueNumber, transferUrl)
}).pipe(Effect.scoped, Effect.provide(ContentLive))

export default defineContentScript({
  matches: ["*://queue.tiket.com/*"],
  main() {
    program.pipe(BrowserRuntime.runMain)
  },
})
