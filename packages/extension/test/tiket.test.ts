import { beforeEach, describe, expect, it } from "@effect/vitest"
import { CustomerStore } from "@/lib/customer-store"
import type { Customer } from "@tx/schema"
import { Page } from "@/lib/playwlite"
import { Cause, Effect, Exit } from "effect"
import {
  COUNTRY_INDONESIA_TEXT,
  COUNTRY_SHEET_TEXT,
  selectIndonesiaInCountrySheet,
  runOrder,
} from "../src/entrypoints/tiket.content/flow-order"
import { runPayment } from "../src/entrypoints/tiket.content/flow-payment"
import { virtualAccountFromRoot } from "../src/entrypoints/tiket.content/flow-payment-confirm"
import { runPackages } from "../src/entrypoints/tiket.content/flow-packages"
import { loadFixture, NodePlatform, resetDom } from "./util"

const defaultCustomer: typeof Customer.Type = {
  name: "Test User",
  email: "test@example.com",
  birthDate: "2000-01-01",
  gender: "female",
  nik: "1234567890123456",
  phone: "81234567890",
  categories: ["last forever fan"],
  ticketCount: 6,
  day: "day 1",
  membershipCode: "WDYSLM",
  paymentMethod: "BCA Virtual Account",
}

const orderCustomer: typeof Customer.Type = {
  name: "Tono Tenda",
  email: "tonotenda@example.com",
  birthDate: "2003-07-13",
  gender: "female",
  nik: "3122022302230022",
  phone: "82259225223",
  categories: ["cat 1"],
  ticketCount: 1,
  day: "day 1",
  membershipCode: "BA203480222",
  paymentMethod: "BCA Virtual Account",
}

const babymonsterCustomer: typeof Customer.Type = {
  name: "Fixture Customer A",
  email: "fixture-customer-a@example.com",
  birthDate: "2002-01-15",
  gender: "female",
  nik: "1000000000000001",
  phone: "81100000001",
  categories: ["vip soundcheck a", "cat 3"],
  ticketCount: 2,
  day: "day 1",
  membershipCode: "BZ689417275",
  paymentMethod: "BCA Virtual Account",
}

const expectTaggedFailure = async (effect: Effect.Effect<void, unknown, never>, tag: string) => {
  const exit = await Effect.runPromiseExit(effect)
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isFailure(exit)) {
    expect(Cause.pretty(exit.cause)).toContain(tag)
  }
}

const flowLayers = (customer: typeof Customer.Type = defaultCustomer) =>
  CustomerStore.testLayer(customer)

const runPackagesWithCustomer = (customer: typeof Customer.Type = defaultCustomer) =>
  runPackages.pipe(Effect.provide(flowLayers(customer)))

const runOrderWithCustomer = (customer: typeof Customer.Type = orderCustomer) =>
  runOrder.pipe(Effect.provide(flowLayers(customer)))

const runPaymentWithCustomer = (customer: typeof Customer.Type = orderCustomer) =>
  runPayment.pipe(Effect.provide(flowLayers(customer)))

const makeVisible = () => {
  for (const element of document.querySelectorAll("*")) {
    Object.defineProperty(element, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 10,
        bottom: 10,
        width: 10,
        height: 10,
        toJSON: () => ({}),
      }),
    })
  }
}

const wireBookingFormSubmit = () => {
  document.querySelector("form")?.addEventListener("submit", (event) => event.preventDefault())

  for (const button of document.querySelectorAll("button[type='submit']")) {
    if (!(button instanceof HTMLButtonElement)) continue
    button.addEventListener("click", (event) => {
      event.preventDefault()
      button.dataset.clicked = "true"
    })
  }
}

const wireVisitorSheetSave = () => {
  const visitorSheetBody = document
    .querySelector("#identity-card-number, #nomor-ktp")
    ?.closest('[data-testid="bottom-sheet-body"]')
  if (!(visitorSheetBody instanceof HTMLElement)) throw new Error("missing visitor sheet body")

  const visitorSheetRoot = visitorSheetBody.closest(".BottomSheet_bottom_sheet__Vdh_H")
  if (!(visitorSheetRoot instanceof HTMLElement)) throw new Error("missing visitor sheet root")

  for (const button of visitorSheetBody.querySelectorAll("button")) {
    if (!/^(save|simpan)$/i.test(button.textContent?.trim() ?? "")) continue
    button.addEventListener("click", () => {
      visitorSheetRoot.style.display = "none"
      visitorSheetBody.style.display = "none"
    })
    break
  }
}

const wireBookingFormInteractions = () => {
  wireBookingFormSubmit()
  wireVisitorSheetSave()

  const checkbox = document.querySelector(".Toggle_hidden_checkbox__9lV4K")
  if (checkbox instanceof HTMLInputElement) checkbox.disabled = false

  makeVisible()
}

const wireCountrySheetDismiss = () => {
  const sheetBody = document.querySelector('[data-testid="bottom-sheet-body"]')
  if (!(sheetBody instanceof HTMLElement)) throw new Error("missing country sheet body")

  const sheetRoot = sheetBody.closest(".BottomSheet_bottom_sheet__Vdh_H")
  if (!(sheetRoot instanceof HTMLElement)) throw new Error("missing country sheet root")

  const indonesia = [...sheetBody.querySelectorAll(".CountryListSelection_list_item__2dUCg")].find(
    (item) => COUNTRY_INDONESIA_TEXT.test(item.textContent?.trim() ?? ""),
  )
  if (!(indonesia instanceof HTMLElement)) throw new Error("missing Indonesia option")

  indonesia.addEventListener("click", () => {
    sheetRoot.style.display = "none"
    sheetBody.style.display = "none"
  })

  makeVisible()
}

const wirePaymentPage = () => {
  const submitButton = document.querySelector('[data-testid="submit_button"]')
  if (!(submitButton instanceof HTMLButtonElement)) throw new Error("missing submit button")

  const paymentMethod = document.querySelector('[data-testid="payment-method"]')
  if (!(paymentMethod instanceof HTMLElement)) throw new Error("missing payment method section")

  paymentMethod.addEventListener("click", (event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const tile = target.closest(".PaymentTile_selected_payment_tile_var_b__owKVH")
    if (!tile) return
    const radio = tile.querySelector('input[type="radio"]')
    if (radio instanceof HTMLInputElement) radio.checked = true
    submitButton.disabled = false
  })

  submitButton.addEventListener("click", () => {
    submitButton.dataset.clicked = "true"
  })

  makeVisible()
}

const wireSeeOtherPackagesDismiss = () => {
  for (const button of document.querySelectorAll("button")) {
    if (!/see other packages/i.test(button.textContent?.trim() ?? "")) continue
    button.addEventListener("click", () => {
      const modalRoot = document.getElementById("modal-root")
      if (modalRoot instanceof HTMLElement) modalRoot.replaceChildren()
    })
    break
  }

  makeVisible()
}

describe("tiket autobuy", () => {
  beforeEach(resetDom)

  it.each([
    ["en", "tiket-lany-packages-en.html"],
    ["id", "tiket-lany-packages-id.html"],
  ])("submits order from package bottom sheet (%s)", async (_locale, fixture) => {
    await Effect.runPromise(
      loadFixture(`../../../fixtures/${fixture}`).pipe(Effect.provide(NodePlatform)),
    )
    makeVisible()

    const input = document.querySelector('[data-testid="bottom-sheet-body"] input[type="number"]')
    if (!(input instanceof HTMLInputElement)) throw new Error("missing qty input")
    input.value = "6"
    input.removeAttribute("disabled")

    await Effect.runPromise(runPackagesWithCustomer())
  })

  it("rejects membership code already used on presale packages page", async () => {
    await Effect.runPromise(
      loadFixture("../../../fixtures/tiket-babymonster-weverse-packages-code-used-en.html").pipe(
        Effect.provide(NodePlatform),
      ),
    )
    makeVisible()

    await expectTaggedFailure(
      runPackagesWithCustomer(babymonsterCustomer),
      "MembershipCodeRejected",
    )
  })

  it("dismisses unavailable package modal until categories are exhausted", async () => {
    await Effect.runPromise(
      loadFixture(
        "../../../fixtures/tiket-babymonster-weverse-packages-unavailable-modal-en.html",
      ).pipe(Effect.provide(NodePlatform)),
    )
    wireSeeOtherPackagesDismiss()

    await expectTaggedFailure(runPackagesWithCustomer(babymonsterCustomer), "NoPackageAvailable")
  })

  it.each([
    ["en", "tiket-booking-form-country-en.html"],
    ["id", "tiket-booking-form-country-id.html"],
  ])("selects Indonesia on country sheet (%s)", async (_locale, fixture) => {
    await Effect.runPromise(
      loadFixture(`../../../fixtures/${fixture}`).pipe(Effect.provide(NodePlatform)),
    )
    wireCountrySheetDismiss()

    const page = new Page(document)

    await Effect.runPromise(selectIndonesiaInCountrySheet)

    const visibleSheets = await Effect.runPromise(
      page
        .getByTestId("bottom-sheet-body")
        .filter({ visible: true, hasText: COUNTRY_SHEET_TEXT })
        .count(),
    )
    expect(visibleSheets).toBe(0)
  })

  it.each([
    {
      locale: "en",
      fixture: "tiket-booking-form-en.html",
      emailSelector: "#email-address",
      nikSelector: "#identity-card-number",
      countrySelector: "#countryregion-of-residence",
    },
    {
      locale: "id",
      fixture: "tiket-booking-form-id.html",
      emailSelector: "#alamat-email",
      nikSelector: "#nomor-ktp",
      countrySelector: "#negara-tempat-tinggal",
    },
  ])(
    "fills booking form and continues to payment ($locale)",
    async ({ fixture, emailSelector, nikSelector, countrySelector }) => {
      await Effect.runPromise(
        loadFixture(`../../../fixtures/${fixture}`).pipe(Effect.provide(NodePlatform)),
      )
      wireBookingFormInteractions()

      await Effect.runPromise(runOrderWithCustomer())

      const countryInput = document.querySelector(countrySelector)
      const contactEmail = document.querySelector(
        `[data-testid="contact-detail-card"] ${emailSelector}`,
      )
      const nik = document.querySelector(nikSelector)
      const toggle = document.querySelector(".Toggle_hidden_checkbox__9lV4K")
      const continueButton = document.querySelector("button.PaymentDetail_button_payment__mfN_v")
      if (!(countryInput instanceof HTMLInputElement)) throw new Error("missing country input")
      if (!(contactEmail instanceof HTMLInputElement)) throw new Error("missing contact email")
      if (!(nik instanceof HTMLInputElement)) throw new Error("missing identity card input")
      if (!(toggle instanceof HTMLInputElement)) throw new Error("missing same-as-contact toggle")
      if (!(continueButton instanceof HTMLButtonElement)) throw new Error("missing continue button")

      expect(countryInput.value).toBe("Indonesia")
      expect(contactEmail.value).toBe(orderCustomer.email)
      expect(nik.value).toBe(orderCustomer.nik)
      expect(toggle.checked).toBe(true)
      expect(continueButton.dataset.clicked).toBe("true")
    },
    15_000,
  )

  it.each([
    ["en", "tiket-payment-en.html"],
    ["id", "tiket-payment-id.html"],
  ])("selects payment method and submits (%s)", async (_locale, fixture) => {
    await Effect.runPromise(
      loadFixture(`../../../fixtures/${fixture}`).pipe(Effect.provide(NodePlatform)),
    )
    wirePaymentPage()

    await Effect.runPromise(runPaymentWithCustomer())

    const bcaRadio = [
      ...document.querySelectorAll('[data-testid="payment-method"] input[type="radio"]'),
    ].find((radio) =>
      radio
        .closest(".PaymentTile_selected_payment_tile_var_b__owKVH")
        ?.textContent?.includes("BCA Virtual Account"),
    )
    const submitButton = document.querySelector('[data-testid="submit_button"]')
    if (!(submitButton instanceof HTMLButtonElement)) throw new Error("missing submit button")
    if (!(bcaRadio instanceof HTMLInputElement)) throw new Error("missing BCA radio")

    expect(bcaRadio.checked).toBe(true)
    expect(submitButton.dataset.clicked).toBe("true")
  })

  it("extracts virtual account from payment confirm (en)", async () => {
    await Effect.runPromise(
      loadFixture("../../../fixtures/tiket-payment-confirm-vabca-en.html").pipe(
        Effect.provide(NodePlatform),
      ),
    )
    expect(virtualAccountFromRoot(document)).toBe("780011349304235")
  })

  it("extracts virtual account from payment confirm (id)", async () => {
    await Effect.runPromise(
      loadFixture("../../../fixtures/tiket-payment-confirm-vabca-id.html").pipe(
        Effect.provide(NodePlatform),
      ),
    )
    expect(virtualAccountFromRoot(document)).toBe("780011349415035")
  })
})
