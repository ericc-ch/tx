import { CustomerStore } from "@/lib/customer-store"
import { Duration, Effect } from "effect"
import { AutobuyProgress, canRunPageStep } from "./autobuy-progress"
import * as RateLimitDialog from "./rate-limit-dialog"
import { runOrder } from "./flow-order"
import { runOverview } from "./flow-overview"
import { runPackages } from "./flow-packages"
import { runPaymentConfirm } from "./flow-payment-confirm"
import { runPayment } from "./flow-payment"
import { pageKind } from "./routing"

const idleSleep = Effect.sleep(Duration.seconds(1))

export const runAutobuyPipeline = Effect.gen(function* () {
  const store = yield* CustomerStore
  const progress = yield* AutobuyProgress
  const customer = yield* store.require()
  let completed = yield* progress.resolvedCompleted(customer.email, pageKind(location))
  let lastLoggedKey = ""

  while (completed !== "confirm") {
    if (yield* RateLimitDialog.handleIfPresent) {
      yield* idleSleep
      continue
    }

    const browserState = pageKind(location)
    const stepKey = `${completed}:${browserState}`

    if (stepKey !== lastLoggedKey) {
      yield* Effect.logDebug(
        "Autobuy step",
        "browserState",
        browserState,
        "completedThrough",
        completed,
      )
      lastLoggedKey = stepKey
    }

    // Overview is navigation-only, not a checkout checkpoint — must not use canRunPageStep.
    if (browserState === "overview") {
      yield* runOverview
      yield* idleSleep
      continue
    }

    if (!canRunPageStep(completed, browserState)) {
      yield* idleSleep
      continue
    }

    switch (browserState) {
      case "packages":
        yield* runPackages
        completed = yield* progress.markCompleted(customer.email, "packages")
        break
      case "order":
        yield* runOrder
        completed = yield* progress.markCompleted(customer.email, "order")
        break
      case "payment":
        yield* runPayment
        completed = yield* progress.markCompleted(customer.email, "payment")
        break
      case "payment-confirm":
        yield* runPaymentConfirm
        completed = yield* progress.markCompleted(customer.email, "confirm")
        break
      case "unknown":
        yield* idleSleep
        break
      default:
        browserState satisfies never
    }
  }
})
