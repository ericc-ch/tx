import { Init } from "@/lib/init"
import { CustomerStore } from "@/lib/customer-store"
import { ContentLive } from "@/lib/rpc"
import { BrowserRuntime } from "@effect/platform-browser"
import { ServerRpcs } from "@tx/server/schema"
import { Duration, Effect, Layer, Option } from "effect"
import { RpcClient } from "effect/unstable/rpc"
import { runOrder } from "./flow-order"
import { resetToOverview, runOverview } from "./flow-overview"
import { runPackages } from "./flow-packages"
import { pageKind } from "./routing"

const maxAutobuyAttempts = 3

type FlowStep = "routing" | "awaiting-order" | "done"

const acquireCustomer = Effect.gen(function* () {
  const store = yield* CustomerStore
  const existing = yield* store.getOption()
  if (Option.isSome(existing)) {
    yield* Effect.logInfo("Resuming claimed customer", existing.value.email)
    return
  }

  const client = yield* RpcClient.make(ServerRpcs)
  const init = yield* Init
  const { browserId } = yield* init.get()

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
    const browserState = pageKind(location)
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

const runAutobuyWithRetries = runAutobuyFlow.pipe(
  Effect.tapError((error) =>
    Effect.gen(function* () {
      yield* Effect.logWarning("Autobuy attempt failed:", error)
      yield* resetToOverview
    }),
  ),
  Effect.retry({ times: maxAutobuyAttempts - 1 }),
)

const main = Effect.gen(function* () {
  const store = yield* CustomerStore

  while (true) {
    yield* acquireCustomer
    const purchased = yield* runAutobuyWithRetries.pipe(
      Effect.as(true),
      Effect.catch((cause) =>
        Effect.gen(function* () {
          yield* store.clear()
          yield* Effect.logWarning(
            "Customer wasted after",
            maxAutobuyAttempts,
            "failed attempts:",
            cause,
          )
          return false
        }),
      ),
    )
    if (purchased) {
      yield* Effect.logInfo("Purchase successful")
      return
    }
  }
}).pipe(Effect.scoped)

const AutobuyLive = Layer.mergeAll(ContentLive, CustomerStore.layer)

export default defineContentScript({
  matches: ["*://www.tiket.com/*", "*://localhost/*"],
  main() {
    main.pipe(Effect.provide(AutobuyLive), BrowserRuntime.runMain)
  },
})
