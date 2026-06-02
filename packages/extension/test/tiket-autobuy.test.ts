import { beforeEach, describe, expect, it } from "@effect/vitest"
import { CustomerStore } from "@/lib/customer-store"
import { Effect, Fiber, Layer, Option } from "effect"
import { runOrder } from "../src/entrypoints/tiket-autobuy.content/flow-order"
import { runPayment } from "../src/entrypoints/tiket-autobuy.content/flow-payment"
import { runPackages } from "../src/entrypoints/tiket-autobuy.content/flow-packages"
import { loadFixture, NodePlatform, resetDom } from "./util"

const defaultCustomer = {
  name: "Test User",
  email: "test@example.com",
  birthDate: "2000-01-01",
  gender: "female",
  nik: "1234567890123456",
  phone: "81234567890",
  categories: ["cat 6", "last forever fan", "festival", "cat 1"],
  ticketCount: 6,
  day: "day 1",
  membershipCode: "WDYSLM",
  paymentMethod: "BCA Virtual Account",
}

const orderCustomer = {
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

const customerStoreLayer = (customer = defaultCustomer) =>
  Layer.succeed(
    CustomerStore,
    CustomerStore.of({
      get: Effect.fn(function* () {
        return yield* Effect.succeed(Option.some(customer))
      }),
      set: Effect.fn(function* () {}),
      remove: Effect.fn(function* () {}),
    }),
  )

const runPackagesWithCustomer = (customer = defaultCustomer) =>
  runPackages.pipe(Effect.provide(customerStoreLayer(customer)))

const runOrderWithCustomer = (customer = orderCustomer) =>
  runOrder.pipe(Effect.provide(customerStoreLayer(customer)))

const runPaymentWithCustomer = (customer = orderCustomer) =>
  runPayment.pipe(Effect.provide(customerStoreLayer(customer)))

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

const wireBookingFormSheet = () => {
  document.querySelector("form")?.addEventListener("submit", (event) => event.preventDefault())

  for (const button of document.querySelectorAll("button[type='submit']")) {
    if (!(button instanceof HTMLButtonElement)) continue
    button.addEventListener("click", (event) => {
      event.preventDefault()
      button.dataset.clicked = "true"
    })
  }

  const countryInput = document.querySelector("#countryregion-of-residence")
  if (!(countryInput instanceof HTMLInputElement)) throw new Error("missing country input")

  const modalRoot = document.querySelector("#modal-root")
  if (!(modalRoot instanceof HTMLElement)) throw new Error("missing modal root")

  const countrySheetRoot = document.createElement("div")
  countrySheetRoot.className = "BottomSheet_bottom_sheet__Vdh_H"
  countrySheetRoot.style.display = "none"
  countrySheetRoot.innerHTML = `
    <div data-testid="bottom-sheet-body">
      <h2>Country/Region of residence</h2>
      <div class="CountryListSelection_list_item__2dUCg">
        <p class="List_title__laI5Q">Indonesia (+62)</p>
      </div>
    </div>
  `
  modalRoot.appendChild(countrySheetRoot)

  const countrySheetBody = countrySheetRoot.querySelector('[data-testid="bottom-sheet-body"]')
  if (!(countrySheetBody instanceof HTMLElement)) throw new Error("missing country sheet body")

  const indonesia = countrySheetRoot.querySelector(".CountryListSelection_list_item__2dUCg")
  if (!(indonesia instanceof HTMLElement)) throw new Error("missing indonesia option")
  indonesia.addEventListener("click", () => {
    countryInput.value = "Indonesia"
    countrySheetRoot.style.display = "none"
    countrySheetBody.style.display = "none"
  })

  countryInput.addEventListener("click", () => {
    countrySheetRoot.style.display = ""
    countrySheetBody.style.display = ""
  })

  const visitorSheetBody = document
    .querySelector("#identity-card-number")
    ?.closest('[data-testid="bottom-sheet-body"]')
  if (!(visitorSheetBody instanceof HTMLElement)) throw new Error("missing visitor sheet body")

  const visitorSheetRoot = visitorSheetBody.closest(".BottomSheet_bottom_sheet__Vdh_H")
  if (!(visitorSheetRoot instanceof HTMLElement)) throw new Error("missing visitor sheet root")

  visitorSheetRoot.style.display = "none"
  visitorSheetBody.style.display = "none"

  const checkbox = document.querySelector(".Toggle_hidden_checkbox__9lV4K")
  if (!(checkbox instanceof HTMLInputElement)) throw new Error("missing same-as-contact toggle")
  checkbox.checked = false

  checkbox.addEventListener("change", () => {
    const visible = checkbox.checked
    visitorSheetRoot.style.display = visible ? "" : "none"
    visitorSheetBody.style.display = visible ? "" : "none"
  })

  for (const button of visitorSheetBody.querySelectorAll("button")) {
    if (!/^save$/i.test(button.textContent?.trim() ?? "")) continue
    button.addEventListener("click", () => {
      visitorSheetRoot.style.display = "none"
      visitorSheetBody.style.display = "none"
    })
    break
  }

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

describe("tiket autobuy", () => {
  beforeEach(resetDom)

  it("submits order from package bottom sheet", async () => {
    await Effect.runPromise(
      loadFixture("../../../fixtures/lany-packages-en.html").pipe(Effect.provide(NodePlatform)),
    )
    makeVisible()

    const input = document.querySelector('[data-testid="bottom-sheet-body"] input[type="number"]')
    if (!(input instanceof HTMLInputElement)) throw new Error("missing qty input")
    input.value = "6"
    input.removeAttribute("disabled")

    expect(await Effect.runPromise(runPackagesWithCustomer())).toBe("submitted")
  })

  it("submits order from post-verify presale sheet", async () => {
    await Effect.runPromise(
      loadFixture("../../../fixtures/whitelist-packages-ready-en.html").pipe(
        Effect.provide(NodePlatform),
      ),
    )
    makeVisible()

    const input = document.querySelector('[data-testid="bottom-sheet-body"] input[type="number"]')
    if (!(input instanceof HTMLInputElement)) throw new Error("missing qty input")
    input.value = "6"
    input.removeAttribute("disabled")

    expect(await Effect.runPromise(runPackagesWithCustomer())).toBe("submitted")
  })

  it("fills presale code on presale page", async () => {
    await Effect.runPromise(
      loadFixture("../../../fixtures/whitelist-packages-verify-en.html").pipe(
        Effect.provide(NodePlatform),
      ),
    )
    makeVisible()

    const customer = { ...defaultCustomer, categories: ["cat 1"] }
    const fiber = Effect.runFork(runPackagesWithCustomer(customer))
    await new Promise((resolve) => setTimeout(resolve, 500))

    const input = document.querySelector('[data-testid="bottom-sheet-body"] input[type="text"]')
    if (!(input instanceof HTMLInputElement)) throw new Error("missing presale code input")
    expect(input.value).toBe(customer.membershipCode)

    await Effect.runPromise(Fiber.interrupt(fiber))
  })

  it("fills booking form and continues to payment", async () => {
    await Effect.runPromise(
      loadFixture("../../../fixtures/tiket-booking-form.html").pipe(Effect.provide(NodePlatform)),
    )
    wireBookingFormSheet()

    expect(await Effect.runPromise(runOrderWithCustomer())).toBe("submitted")

    const countryInput = document.querySelector("#countryregion-of-residence")
    const contactEmail = document.querySelector('[data-testid="contact-detail-card"] #email-address')
    const nik = document.querySelector("#identity-card-number")
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
  }, 15_000)

  it("selects payment method and submits pay now", async () => {
    await Effect.runPromise(
      loadFixture("../../../fixtures/tiket-payment.html").pipe(Effect.provide(NodePlatform)),
    )
    wirePaymentPage()

    expect(await Effect.runPromise(runPaymentWithCustomer())).toBe("submitted")

    const bcaRadio = [...document.querySelectorAll('[data-testid="payment-method"] input[type="radio"]')].find(
      (radio) =>
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
})
