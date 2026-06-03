import { CustomerStore } from "@/lib/customer-store"
import { ContentLive } from "@/lib/rpc"
import { AutobuyProgress } from "./autobuy-progress"
import { runAutobuySession } from "./autobuy-session"
import { BrowserRuntime } from "@effect/platform-browser"
import { Effect, Layer } from "effect"

const AutobuyLive = Layer.mergeAll(ContentLive, CustomerStore.layer, AutobuyProgress.layer)

export default defineContentScript({
  matches: ["*://www.tiket.com/*", "*://localhost/*"],
  main() {
    runAutobuySession.pipe(Effect.provide(AutobuyLive), BrowserRuntime.runMain)
  },
})
