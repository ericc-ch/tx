import { BrowserHttpClient } from "@effect/platform-browser"
import { Duration, Effect, Layer } from "effect"
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
  Layer.provideMerge(RpcSerialization.layerJsonRpc()),
  Layer.provideMerge(BrowserHttpClient.layerXMLHttpRequest),
)

const reportQueuePosition = Effect.gen(function* () {
  const client = yield* RpcClient.make(ServerRpcs)

  while (true) {
    const position = readPeopleAhead()
    if (position) {
      yield* client.ReportQueuePosition(position)
      return
    }
    yield* Effect.sleep(Duration.seconds(1))
  }
}).pipe(Effect.scoped, Effect.provide(ClientLayer))

export default defineContentScript({
  matches: [
    "*://*.queue-it.com/*",
    "*://queue.tiket.com/*",
    "file:///home/erickc/projects/tiket-tools/fixtures/the-weeknd-queue.html",
  ],
  main() {
    void Effect.runFork(
      reportQueuePosition.pipe(Effect.tapError((error) => Effect.logError(String(error)))),
    )
  },
})
