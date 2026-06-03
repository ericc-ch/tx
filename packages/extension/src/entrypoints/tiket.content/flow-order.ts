import { CustomerStore } from "@/lib/customer-store"
import { Page } from "@/lib/playwlite"
import { Effect } from "effect"

export const SAVE_BUTTON_TEXT = /^(save|simpan)$/i
export const CONTINUE_PAYMENT_TEXT = /continue to payment|lanjut(?:kan)?(?:\s+ke)?\s+pembayaran/i
export const COUNTRY_SHEET_TEXT = /country\/region of residence|negara tempat tinggal/i
export const COUNTRY_INDONESIA_TEXT = /^Indonesia \(\+62\)$/
export const VISITOR_SHEET_TEXT = /visitor details|detail pengunjung/i

const salutationForGender = (gender: string) =>
  gender === "male" ? /^(mr\.?|tuan)$/i : /^(ms\.?|nona)$/i

export const selectIndonesiaInCountrySheet = Effect.gen(function* () {
  const page = new Page(document)
  const countrySheet = page
    .getByTestId("bottom-sheet-body")
    .filter({ visible: true, hasText: COUNTRY_SHEET_TEXT })
  yield* countrySheet.waitFor({ state: "visible" })
  yield* countrySheet.getByText(COUNTRY_INDONESIA_TEXT).click()
  yield* countrySheet.waitFor({ state: "hidden" })
})

export const runOrder = Effect.gen(function* () {
  const store = yield* CustomerStore
  const customer = yield* store.require()
  const page = new Page(document)

  const contactCard = page.getByTestId("contact-detail-card")
  yield* contactCard.waitFor({ state: "visible" })

  yield* contactCard
    .getByText(salutationForGender(customer.gender))
    .filter({ visible: true })
    .first()
    .click()
  yield* contactCard.locator("#full-name, #nama-lengkap").fill(customer.name)
  yield* contactCard.locator("#mobile-number, #nomor-ponsel").fill(customer.phone)
  yield* contactCard.locator("#email-address, #alamat-email").fill(customer.email)

  const countryInput = contactCard.locator("#countryregion-of-residence, #negara-tempat-tinggal")
  if ((yield* countryInput.inputValue()).trim() !== "Indonesia") {
    yield* countryInput.click()
    yield* selectIndonesiaInCountrySheet
  }
  yield* Effect.logDebug("Filled contact details for", customer.email)

  yield* page.locator('input[type="checkbox"]').check({ force: true })
  yield* Effect.logDebug("Enabled same-as-contact for", customer.email)

  const visitorSheet = page
    .getByTestId("bottom-sheet-body")
    .filter({ visible: true, hasText: VISITOR_SHEET_TEXT })
  yield* visitorSheet.waitFor({ state: "visible" })

  yield* visitorSheet.locator("#identity-card-number, #nomor-ktp").fill(customer.nik)
  yield* visitorSheet.getByRole("button", { name: SAVE_BUTTON_TEXT }).click()
  yield* visitorSheet.waitFor({ state: "hidden" })
  yield* Effect.logDebug("Saved visitor details for", customer.email)

  yield* page.getByRole("button", { name: CONTINUE_PAYMENT_TEXT }).click({ force: true })
  yield* Effect.logInfo("Continued to payment for", customer.email, customer.paymentMethod)
})
