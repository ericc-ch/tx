import { CustomerStore } from "@/lib/customer-store"
import { Page } from "@/lib/playwlite"
import { Effect, Option } from "effect"

export const SAME_AS_CONTACT_TEXT = /same as contact details|sama dengan detail kontak/i
export const SAVE_BUTTON_TEXT = /^(save|simpan)$/i
export const CONTINUE_PAYMENT_TEXT = /continue to payment|lanjut(?:kan)? ke pembayaran/i
export const COUNTRY_SHEET_TEXT = /country\/region of residence/i
export const COUNTRY_INDONESIA_TEXT = /^Indonesia \(\+62\)$/
export const VISITOR_SHEET_TEXT = /visitor details/i

const salutationForGender = (gender: string) => (gender === "male" ? "Mr" : "Ms")

export const runOrder = Effect.gen(function* () {
  const store = yield* CustomerStore
  const customerOption = yield* store.get()
  if (Option.isNone(customerOption)) {
    return yield* Effect.die(new Error("No customer in storage"))
  }
  const customer = customerOption.value
  const page = new Page(document)

  const contactCard = page.getByTestId("contact-detail-card")
  yield* contactCard.waitFor({ state: "visible" })

  yield* contactCard
    .getByText(salutationForGender(customer.gender))
    .filter({ visible: true })
    .first()
    .click()
  yield* contactCard.locator("#full-name").fill(customer.name)
  yield* contactCard.locator("#mobile-number").fill(customer.phone)
  yield* contactCard.locator("#email-address").fill(customer.email)
  yield* contactCard.locator("#countryregion-of-residence").click()
  const countrySheet = page
    .getByTestId("bottom-sheet-body")
    .filter({ visible: true, hasText: COUNTRY_SHEET_TEXT })
  yield* countrySheet.waitFor({ state: "visible" })
  yield* countrySheet.getByText(COUNTRY_INDONESIA_TEXT).click()
  yield* countrySheet.waitFor({ state: "hidden" })
  yield* Effect.logDebug("Filled contact details for", customer.email)

  yield* page.locator('input[type="checkbox"]').check({ force: true })
  yield* Effect.logDebug("Enabled same-as-contact for", customer.email)

  const visitorSheet = page
    .getByTestId("bottom-sheet-body")
    .filter({ visible: true, hasText: VISITOR_SHEET_TEXT })
  yield* visitorSheet.waitFor({ state: "visible" })

  yield* visitorSheet.locator("#identity-card-number").fill(customer.nik)
  yield* visitorSheet.getByRole("button", { name: SAVE_BUTTON_TEXT }).click()
  yield* visitorSheet.waitFor({ state: "hidden" })
  yield* Effect.logDebug("Saved visitor details for", customer.email)

  yield* page.getByRole("button", { name: CONTINUE_PAYMENT_TEXT }).click({ force: true })
  yield* Effect.logInfo("Continued to payment for", customer.email, customer.paymentMethod)
  return "submitted" as const
})
