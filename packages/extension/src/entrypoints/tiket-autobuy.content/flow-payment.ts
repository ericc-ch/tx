import { CustomerStore } from "@/lib/customer-store"
import { Page } from "@/lib/playwlite"
import { Duration, Effect, Option } from "effect"

export const runPayment = Effect.gen(function* () {
  const store = yield* CustomerStore
  const customerOption = yield* store.get()
  if (Option.isNone(customerOption)) {
    return yield* Effect.die(new Error("No customer in storage"))
  }
  const customer = customerOption.value
  const page = new Page(document)

  const paymentMethods = page.getByTestId("payment-method")
  yield* paymentMethods.waitFor({ state: "visible" })

  yield* paymentMethods.getByText(customer.paymentMethod, { exact: true }).first().click()

  const submitButton = page.getByTestId("submit_button")
  while (yield* submitButton.isDisabled()) {
    yield* Effect.sleep(Duration.millis(10))
  }

  yield* submitButton.click()
  yield* Effect.logInfo("Submitted payment for", customer.email, customer.paymentMethod)
  return "submitted" as const
})
