import { Config } from "@/lib/config"
import { CustomerStore } from "@/lib/customer"
import { ContentLive } from "@/lib/rpc"
import { BrowserRuntime } from "@effect/platform-browser"
import { ServerRpcs } from "@tx/server/schema"
import { Duration, Effect, Layer, Option } from "effect"
import { RpcClient } from "effect/unstable/rpc"
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

const acquireCustomer = Effect.gen(function* () {
  const store = yield* CustomerStore
  const existing = yield* store.getOption()
  if (Option.isSome(existing)) {
    yield* Effect.logInfo("Resuming claimed customer", existing.value.email)
    return
  }

  const client = yield* RpcClient.make(ServerRpcs)
  const config = yield* Config
  const { browserId } = yield* config.get()

  while (true) {
    const response = yield* client.ClaimCustomer({ browserId })
    if ("empty" in response) {
      yield* Effect.logInfo("Customer pool empty, waiting...")
      yield* Effect.sleep(Duration.seconds(5))
      continue
    }

    yield* store.set(response.customer)
    yield* Effect.logInfo("Acquired customer", response.customer.email)
    return
  }
})

const runAutobuyFlow = Effect.gen(function* () {
  let flowStep: FlowStep = "routing"

  while (flowStep !== "done") {
    const browserState = getBrowserState()
    yield* Effect.logDebug("Autobuy step", "browserState:", browserState, "flowStep:", flowStep)

    switch (flowStep) {
      case "routing":
        switch (browserState) {
          case "overview":
            yield* runOverview
            break
          case "packages": {
            const result = yield* runPackages
            if (result === "submitted") flowStep = "awaiting-order"
            else if (result === "no-package") return yield* Effect.fail("no-package")
            break
          }
          case "order": {
            const result = yield* runOrder
            if (result === "done") flowStep = "done"
            break
          }
          case "unknown":
            yield* Effect.logInfo("Unknown page, waiting...")
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
          yield* Effect.logDebug("Waiting for order page", "browserState:", browserState)
        }
        break
      default:
        flowStep satisfies never
    }
  }
})

const runAutobuyWithRetries = (maxRetries: number) =>
  Effect.gen(function* () {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const result = yield* runAutobuyFlow.pipe(
        Effect.matchEffect({
          onFailure: (cause) =>
            Effect.gen(function* () {
              yield* Effect.logWarning("Autobuy attempt", attempt, "failed:", cause)
              return "retry" as const
            }),
          onSuccess: () => Effect.succeed("success" as const),
        }),
      )
      if (result === "success") return "success" as const
    }
    return "exhausted" as const
  })

const main = Effect.gen(function* () {
  const config = yield* Config
  const store = yield* CustomerStore
  const { maxRetries } = yield* config.get()

  while (true) {
    yield* acquireCustomer
    const result = yield* runAutobuyWithRetries(maxRetries)
    if (result === "success") {
      yield* Effect.logInfo("Purchase successful")
      return
    }

    yield* store.clear()
    yield* Effect.logWarning("Customer wasted after", maxRetries, "failed attempts")
  }
}).pipe(Effect.scoped)

const AutobuyLive = Layer.mergeAll(ContentLive, CustomerStore.layer)

export default defineContentScript({
  matches: ["*://www.tiket.com/*", "*://localhost/*"],
  main() {
    main.pipe(Effect.provide(AutobuyLive), BrowserRuntime.runMain)
  },
})
