import { Init } from "@/lib/init"
import { CustomerStore } from "@/lib/customer-store"
import { AutobuyProgress } from "./autobuy-progress"
import { runAutobuyPipeline } from "./autobuy-pipeline"
import { autobuyFailureReason, RateLimited } from "./errors"
import { resetToOverview } from "./flow-overview"
import { Duration, Effect, Option, Result } from "effect"
import { RpcClient } from "effect/unstable/rpc"
import { customerKey, OperatorRpcs, type Customer } from "@tx/schema"

const requireBrowserId = Effect.gen(function* () {
  const init = yield* Init
  const initPayload = yield* init.get()
  if (Option.isNone(initPayload)) {
    return yield* Effect.die(new Error("Extension init not loaded"))
  }
  return initPayload.value.browserId
})

const resolveCustomer = (
  customer: typeof Customer.Type,
  outcome: "finished" | "discarded",
  reason: string,
) =>
  Effect.gen(function* () {
    const client = yield* RpcClient.make(OperatorRpcs)
    const browserId = yield* requireBrowserId

    yield* client.ResolveCustomer({
      browserId,
      customerKey: customerKey(customer),
      outcome,
      reason,
    })
  })

const resolveCustomerBestEffort = (
  customer: typeof Customer.Type,
  outcome: "finished" | "discarded",
  reason: string,
) =>
  resolveCustomer(customer, outcome, reason).pipe(
    Effect.tapError((error) =>
      Effect.logWarning("ResolveCustomer", outcome, "failed for", customer.email, "—", error),
    ),
    Effect.ignore,
  )

const clearLocalCustomer = Effect.gen(function* () {
  const store = yield* CustomerStore
  const progress = yield* AutobuyProgress
  yield* store.remove()
  yield* progress.clear()
})

const discardCustomer = (customer: typeof Customer.Type, reason: string) =>
  Effect.gen(function* () {
    yield* resolveCustomerBestEffort(customer, "discarded", reason)
    yield* clearLocalCustomer
    yield* resetToOverview
    yield* Effect.logWarning("Customer discarded:", customer.email, "—", reason)
  })

export const acquireCustomer = Effect.gen(function* () {
  const store = yield* CustomerStore
  const existing = yield* store.get()
  if (Option.isSome(existing)) {
    yield* Effect.logDebug("Resuming claimed customer", existing.value.email)
    return existing.value
  }

  const client = yield* RpcClient.make(OperatorRpcs)
  const browserId = yield* requireBrowserId

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

const runCustomerAttempt = (customer: typeof Customer.Type) =>
  Effect.gen(function* () {
    let retried429 = false

    while (true) {
      const result = yield* runAutobuyPipeline.pipe(Effect.result)

      if (Result.isSuccess(result)) return true

      const error = result.failure
      if (error instanceof RateLimited && !retried429) {
        retried429 = true
        yield* Effect.logWarning(
          "Rate limited for",
          customer.email,
          "— retrying once:",
          autobuyFailureReason(error),
        )
        continue
      }

      yield* discardCustomer(customer, autobuyFailureReason(error))
      return false
    }
  })

export const runAutobuySession = Effect.gen(function* () {
  const init = yield* Init

  if (Option.isNone(yield* init.get())) {
    yield* Effect.logWarning(
      "Extension init not loaded — launch this tab from `tx tiket start` (missing __init URL param)",
    )
  }

  while (true) {
    const customer = yield* acquireCustomer
    const purchased = yield* runCustomerAttempt(customer)

    if (purchased) {
      yield* resolveCustomerBestEffort(customer, "finished", "purchase completed")
      yield* clearLocalCustomer
      yield* Effect.logInfo("Purchase successful for", customer.email)
      return
    }
  }
}).pipe(Effect.scoped)
