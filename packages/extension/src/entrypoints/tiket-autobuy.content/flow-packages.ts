import { CustomerStore } from "@/lib/customer-store"
import { Locator, Page } from "@/lib/playwlite"
import { Duration, Effect, Option, Schedule } from "effect"
import { NoPackageAvailable } from "./errors"

export const OPEN_SHEET_BUTTON_TEXT =
  /^(pilih|select|pilih tiket|select ticket|verifikasi kode|verify code)$/i
export const PRESALE_CARD_BUTTON_TEXT = /^(verifikasi kode|verify code)$/i
export const VERIFY_BUTTON_TEXT = /^(verifikasi kodemu|verify your code)$/i
export const ORDER_BUTTON_TEXT = /^(pesan|book)$/i
export const SOLD_OUT_TEXT = /^(terjual habis|sold out)$/i

const DEFAULT_CATEGORY_PRIORITY = ["cat 6", "last forever fan", "festival", "cat 1"]

const quantitySettleSchedule = Schedule.spaced("50 millis").pipe(
  Schedule.both(Schedule.during("2 seconds")),
)

export const runPackages = Effect.gen(function* () {
  const store = yield* CustomerStore
  const customerOption = yield* store.get()
  if (Option.isNone(customerOption)) {
    return yield* Effect.die(new Error("No customer in storage"))
  }
  const customer = customerOption.value
  const buyCount = customer.ticketCount
  const categories =
    customer.categories.length > 0 ? customer.categories : DEFAULT_CATEGORY_PRIORITY

  const page = new Page(document)

  // Wait for the first package card to be visible, otherwise available packages resolve to 0
  const cards = page.getByTestId("package-card").filter({ visible: true })
  yield* cards.first().waitFor({ state: "visible", timeout: Duration.infinity })

  const count = yield* cards.count()

  const presaleButton = cards
    .first()
    .getByRole("button", { name: PRESALE_CARD_BUTTON_TEXT, disabled: false })
    .first()

  let isPresalePage = false
  if ((yield* presaleButton.count()) > 0) {
    isPresalePage = true
  }

  const available: Array<{
    title: string
    card: Locator
    selectButton: Locator
  }> = []

  for (let index = 0; index < count; index++) {
    const card = cards.nth(index)

    const footer = card.getByTestId("package-card-footer")
    if ((yield* footer.getByText(SOLD_OUT_TEXT).count()) > 0) continue

    const titleEl = card.locator("h3")
    const title = (yield* titleEl.first().textContent()).trim()

    const openButton = footer
      .getByRole("button", { name: OPEN_SHEET_BUTTON_TEXT, disabled: false })
      .first()
    if ((yield* openButton.count()) === 0) continue

    available.push({ title, card, selectButton: openButton })
  }

  if (available.length === 0) {
    yield* Effect.logWarning("No packages available")
    return yield* new NoPackageAvailable({ reason: "no-inventory" })
  }

  yield* Effect.logDebug(
    "Available packages",
    available.map((p) => p.title),
  )

  const sheet = page.getByTestId("bottom-sheet-body").filter({ visible: true })
  const closeSheet = Effect.gen(function* () {
    yield* page
      .getByTestId("bottom-sheet-header")
      .filter({ visible: true })
      .getByRole("button", { disabled: false })
      .first()
      .click({ timeout: Duration.infinity })
    yield* sheet.waitFor({ state: "hidden", timeout: Duration.infinity })
  })

  for (const priority of categories) {
    const match = available.find((pkg) => pkg.title.toLowerCase().includes(priority.toLowerCase()))
    if (!match) {
      yield* Effect.logDebug("No package found for", priority)
      continue
    }

    yield* Effect.logDebug("Package found for", priority, match.title)

    yield* match.selectButton.click({ timeout: Duration.infinity })
    yield* Effect.logDebug("Opening", match.title)
    yield* sheet.waitFor({ state: "visible", timeout: Duration.infinity })

    if (isPresalePage) {
      if (!customer.membershipCode) {
        yield* Effect.logDebug(
          "Presale code required but no membership code configured for",
          match.title,
        )
        yield* closeSheet
        continue
      }

      yield* Effect.logDebug("Verifying presale code for", match.title)
      const codeInput = sheet.locator('input[type="text"]').filter({ visible: true }).first()
      yield* codeInput.fill(customer.membershipCode, { timeout: Duration.infinity })
      yield* sheet
        .getByRole("button", { name: VERIFY_BUTTON_TEXT, disabled: false })
        .first()
        .click({ timeout: Duration.infinity })
    }

    const quantityInput = sheet.locator('input[type="number"]').filter({ visible: true }).first()
    const quantityEditor = sheet
      .locator('[data-testid^="ticket-qty-editor-"]')
      .filter({ visible: true })
      .first()

    const decrementButton = quantityEditor.locator('button[type="button"]').nth(0)
    const incrementButton = quantityEditor.locator('button[type="button"]').nth(1)

    const quantity = yield* Effect.gen(function* () {
      let value = Number.parseInt(yield* quantityInput.inputValue(), 10)

      while (value !== buyCount) {
        if (Number.isNaN(value)) {
          yield* Effect.logDebug("Quantity input is invalid for", match.title)
          break
        }

        const before = value
        const stepButton = value < buyCount ? incrementButton : decrementButton

        yield* stepButton.click({ timeout: Duration.infinity })

        value = yield* Effect.gen(function* () {
          const quantity = Number.parseInt(yield* quantityInput.inputValue(), 10)
          const buttonDisabled = yield* stepButton.isDisabled()
          return { quantity, buttonDisabled } as const
        }).pipe(
          Effect.repeat({
            until: ({ quantity, buttonDisabled }) =>
              quantity !== before || quantity === buyCount || buttonDisabled,
            schedule: quantitySettleSchedule,
          }),
          Effect.map(({ quantity }) => quantity),
        )

        if (value === before) {
          yield* Effect.logDebug("Quantity stuck at", before, "for", match.title)
          break
        }
      }

      return value
    })
    if (quantity !== buyCount) {
      yield* Effect.logDebug(
        "Quantity",
        buyCount,
        "not available for",
        match.title,
        ". Found",
        quantity,
      )
      yield* closeSheet
      continue
    }

    yield* sheet
      .getByRole("button", { name: ORDER_BUTTON_TEXT, disabled: false })
      .first()
      .click({ timeout: Duration.infinity })
    yield* Effect.logInfo("Ordered", buyCount, "from", match.title, "for", customer.email)
    return "submitted" as const
  }

  yield* Effect.logDebug("No priority package available, exiting")
  return yield* new NoPackageAvailable({ reason: "no-matching-category" })
})
