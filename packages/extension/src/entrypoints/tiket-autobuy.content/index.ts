import { ContentLive } from "@/lib/rpc"
import { BrowserRuntime } from "@effect/platform-browser"
import { Duration, Effect } from "effect"
import { runOrder } from "./flow-order"
import { runOverview } from "./flow-overview"
import { runPackages } from "./flow-packages"

type BrowserState = "overview" | "packages" | "order" | "unknown"
type FlowStep = "routing" | "awaiting-order" | "done"

const getBrowserState = (): BrowserState => {
  const { pathname } = location
  if (pathname.endsWith("/order")) return "order"
  if (pathname.endsWith("/packages")) return "packages"
  if (pathname.includes("/to-do/")) return "overview"
  return "unknown"
}

const main = Effect.gen(function* () {
  yield* Effect.logInfo("Autobuy started")

  let flowStep: FlowStep = "routing"

  while (flowStep !== "done") {
    const browserState = getBrowserState()
    yield* Effect.logInfo("Autobuy step", "browserState:", browserState, "flowStep:", flowStep)

    switch (flowStep) {
      case "routing":
        switch (browserState) {
          case "overview":
            yield* runOverview
            break
          case "packages": {
            const result = yield* runPackages
            if (result === "submitted") flowStep = "awaiting-order"
            break
          }
          case "order": {
            const result = yield* runOrder
            if (result === "done") flowStep = "done"
            break
          }
          case "unknown":
            yield* Effect.logInfo("Unknown page, waiting...")
            yield* Effect.sleep(Duration.millis(100))
            break
          default:
            browserState satisfies never
        }
        break
      case "awaiting-order":
        if (browserState === "order") {
          const result = yield* runOrder
          if (result === "done") flowStep = "done"
        } else {
          yield* Effect.logInfo("Waiting for order page", "browserState:", browserState)
          yield* Effect.sleep(Duration.millis(100))
        }
        break
      default:
        flowStep satisfies never
    }
  }
})

export default defineContentScript({
  matches: ["*://www.tiket.com/*", "*://localhost/*"],
  main() {
    main.pipe(Effect.provide(ContentLive), BrowserRuntime.runMain)
  },
})
