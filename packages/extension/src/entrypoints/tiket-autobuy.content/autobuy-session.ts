import { Init } from "@/lib/init"
import { CustomerStore } from "@/lib/customer-store"
import { AutobuyProgress } from "./autobuy-progress"
import { runAutobuyPipeline } from "./autobuy-pipeline"
import { autobuyFailureReason } from "./errors"
import { resetToOverview } from "./flow-overview"
import { Duration, Effect, Option, Schedule } from "effect"
import { RpcClient } from "effect/unstable/rpc"
import { ServerRpcs } from "@tx/server/schema"

export const MAX_AUTOBUY_ATTEMPTS = 3

export const acquireCustomer = Effect.gen(function* () {
  const store = yield* CustomerStore
  const existing = yield* store.get()
  if (Option.isSome(existing)) {
    yield* Effect.logDebug("Resuming claimed customer", existing.value.email)
    return existing.value
  }

  const client = yield* RpcClient.make(ServerRpcs)
  const init = yield* Init
  const initPayload = yield* init.get()
  if (Option.isNone(initPayload)) {
    return yield* Effect.die(new Error("Extension init not loaded"))
  }
  const { browserId } = initPayload.value

  let poolWasEmpty = false

  while (true) {
    const response = yield* client
      .ClaimCustomer({ browserId })
      .pipe(
        Effect.tapError((error) =>
          Effect.logWarning("ClaimCustomer RPC failed for", browserId, "—", error),
        ),
      )
    if ("empty" in response) {
      if (!poolWasEmpty) {
        yield* Effect.logInfo("Customer pool empty, waiting for customers...")
        poolWasEmpty = true
      }
      yield* Effect.sleep(Duration.seconds(1))
      continue
    }

    poolWasEmpty = false
    yield* store.set(response.customer)
    yield* Effect.logInfo("Acquired customer", response.customer.email)
    return response.customer
  }
})

const autobuyRetryPolicy = Schedule.recurs(MAX_AUTOBUY_ATTEMPTS - 1).pipe(
  Schedule.tapInput((error) =>
    Effect.gen(function* () {
      const { attempt } = yield* Schedule.CurrentMetadata
      if (attempt < MAX_AUTOBUY_ATTEMPTS) {
        yield* Effect.logWarning(
          "Autobuy failed",
          `(${attempt}/${MAX_AUTOBUY_ATTEMPTS}):`,
          autobuyFailureReason(error),
        )
      }
      const progress = yield* AutobuyProgress
      yield* progress.clear()
      yield* resetToOverview
    }),
  ),
)

const runAutobuyWithRetries = Effect.retry(runAutobuyPipeline, autobuyRetryPolicy)

export const runAutobuySession = Effect.gen(function* () {
  const store = yield* CustomerStore
  const progress = yield* AutobuyProgress
  const init = yield* Init

  if (Option.isNone(yield* init.get())) {
    yield* Effect.logWarning(
      "Extension init not loaded — launch this tab from `tx tiket start` (missing __init URL param)",
    )
  }

  while (true) {
    const customer = yield* acquireCustomer

    const purchased = yield* runAutobuyWithRetries.pipe(
      Effect.as(true),
      Effect.catch((cause) =>
        Effect.gen(function* () {
          yield* store.remove()
          yield* progress.clear()
          yield* Effect.logWarning(
            "Customer wasted:",
            customer.email,
            "after",
            MAX_AUTOBUY_ATTEMPTS,
            "attempts —",
            autobuyFailureReason(cause),
          )
          return false
        }),
      ),
    )

    if (purchased) {
      yield* progress.clear()
      yield* Effect.logInfo("Purchase successful for", customer.email)
      return
    }
  }
}).pipe(Effect.scoped)
