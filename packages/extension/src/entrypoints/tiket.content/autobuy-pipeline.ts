import { CustomerStore } from "@/lib/customer-store"
import { Duration, Effect } from "effect"
import { AutobuyProgress } from "./autobuy-progress"
import {
  autobuySteps,
  checkoutSteps,
  finalCheckpoint,
  type AutobuyPage,
  type CheckoutCheckpoint,
} from "./checkout-sequence"
import * as RateLimitDialog from "./rate-limit-dialog"
import { runOrder } from "./flow-order"
import { runOverview } from "./flow-overview"
import { runPackages } from "./flow-packages"
import { runPaymentConfirm } from "./flow-payment-confirm"
import { runPayment } from "./flow-payment"
import { pageKind } from "./routing"
import { waitForPageKind } from "./wait-for-page"

const idleSleep = Effect.sleep(Duration.seconds(1))

const runForPage = (page: AutobuyPage) => {
  switch (page) {
    case "overview":
      return runOverview
    case "packages":
      return runPackages
    case "order":
      return runOrder
    case "payment":
      return runPayment
    case "payment-confirm":
      return runPaymentConfirm
    default:
      page satisfies never
      return idleSleep
  }
}

export const runAutobuyPipeline = Effect.gen(function* () {
  const store = yield* CustomerStore
  const progress = yield* AutobuyProgress
  const customer = yield* store.require()
  let completed = yield* progress.resolvedCompleted(customer.email, pageKind(location))
  let lastLoggedKey = ""

  while (completed !== finalCheckpoint) {
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

    const step = autobuySteps.find((entry) => entry.page === browserState)

    if (!step) {
      yield* idleSleep
      continue
    }

    if (step.kind === "navigation") {
      yield* runForPage(step.page)
      yield* idleSleep
      continue
    }

    const stepIndex = checkoutSteps.findIndex((entry) => entry.page === browserState)
    const required: "none" | CheckoutCheckpoint =
      stepIndex <= 0 ? "none" : checkoutSteps[stepIndex - 1]!.checkpoint

    if (completed !== required) {
      yield* idleSleep
      continue
    }

    yield* runForPage(step.page)
    if ("waitFor" in step) yield* waitForPageKind(step.waitFor)
    completed = yield* progress.markCompleted(customer.email, step.checkpoint)
  }
})
