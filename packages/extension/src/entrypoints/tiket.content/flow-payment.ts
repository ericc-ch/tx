import { CustomerStore } from "@/lib/customer-store"
import { Page } from "@/lib/playwlite"
import { Effect } from "effect"

export const runPayment = Effect.gen(function* () {
  const store = yield* CustomerStore
  const customer = yield* store.require()
  const page = new Page(document)

  const paymentMethods = page.getByTestId("payment-method")
  yield* paymentMethods.waitFor({ state: "visible" })

  yield* paymentMethods.getByText(customer.paymentMethod, { exact: true }).first().click()

  const submitButton = page.getByTestId("submit_button")
  yield* submitButton.click()
  yield* Effect.logInfo("Submitted payment for", customer.email, customer.paymentMethod)
})
