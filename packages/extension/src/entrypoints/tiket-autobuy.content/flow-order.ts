import { CustomerStore } from "@/lib/customer"
import { Effect } from "effect"

export const runOrder = Effect.gen(function* () {
  const store = yield* CustomerStore
  const customer = yield* store.get()
  yield* Effect.logInfo(
    "Reached order page — autobuy complete for",
    customer.email,
    customer.paymentMethod,
  )
  return "done" as const
})
