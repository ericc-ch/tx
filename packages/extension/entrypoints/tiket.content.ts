import { BrowserHttpClient, BrowserRuntime } from "@effect/platform-browser"
import { Effect, Layer, Schedule } from "effect"
import { RpcClient, RpcSerialization } from "effect/unstable/rpc"
import { RPC_HTTP_URL, ServerRpcs } from "@tiket-tools/server/protocol"

const readPeopleAhead = () => {
  const el = document.querySelector("#MainPart_lbUsersInLineAheadOfYou")
  const text = el?.textContent?.trim()
  if (!text || text === "0") return undefined
  const peopleAhead = Number(text.replace(/,/g, ""))
  if (Number.isNaN(peopleAhead)) return undefined
  return { peopleAhead }
}

const ClientLayer = RpcClient.layerProtocolHttp({ url: RPC_HTTP_URL }).pipe(
  Layer.provideMerge(RpcSerialization.layerNdjson),
  Layer.provideMerge(BrowserHttpClient.layerFetch),
)

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
      schedule: Schedule.spaced("1 second"),
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
    BrowserRuntime.runMain(reportQueuePosition.pipe(Effect.provide(ClientLayer)))
  },
})
