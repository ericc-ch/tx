import { CustomerStore } from "@/lib/customer-store"
import { Effect, Option } from "effect"

export const runOrder = Effect.gen(function* () {
  const store = yield* CustomerStore
  const customerOption = yield* store.get()
  if (Option.isNone(customerOption)) {
    return yield* Effect.die(new Error("No customer in storage"))
  }
  const customer = customerOption.value
  yield* Effect.logInfo(
    "Reached order page — autobuy complete for",
    customer.email,
    customer.paymentMethod,
  )
  return "done" as const
})
