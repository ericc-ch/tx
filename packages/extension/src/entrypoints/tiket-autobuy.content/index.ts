import { ContentLive } from "@/lib/rpc"
import { BrowserRuntime } from "@effect/platform-browser"
import { Duration, Effect } from "effect"
import { runOrder } from "./flow-order"
import { runOverview } from "./flow-overview"
import { runPackages } from "./flow-packages"

const getPagePhase = () => {
  const { pathname } = location
  if (pathname.endsWith("/order")) return "order" as const
  if (pathname.endsWith("/packages")) return "packages" as const
  if (pathname.includes("/to-do/")) return "overview" as const
  return undefined
}

const main = Effect.gen(function* () {
  yield* Effect.logInfo("Autobuy started")

  while (true) {
    const phase = getPagePhase()
    yield* Effect.logInfo(`Autobuy step (phase: ${phase ?? "unknown"})`)

    switch (phase) {
      case "overview":
        yield* runOverview
        break
      case "packages":
        yield* runPackages(() => getPagePhase() === "packages")
        break
      case "order": {
        const result = yield* runOrder
        if (result === "done") return
        break
      }
      default:
        yield* Effect.logInfo("Unknown page, waiting...")
    }

    yield* Effect.sleep(Duration.millis(50))
  }
})

export default defineContentScript({
  matches: ["*://www.tiket.com/*", "*://localhost/*"],
  main() {
    main.pipe(Effect.provide(ContentLive), BrowserRuntime.runMain)
  },
})
