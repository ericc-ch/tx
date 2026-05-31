import { CustomerStore } from "@/lib/customer-store"
import { Locator, Page } from "@/lib/playwlite"
import { Duration, Effect } from "effect"
import { NoPackageAvailable } from "./errors"

export const OPEN_SHEET_BUTTON_TEXT =
  /^(pilih|select|pilih tiket|select ticket|verifikasi kodemu|verify(?: your)? code)$/i
export const VERIFY_BUTTON_TEXT = /^(verifikasi kodemu|verify your code)$/i
export const ORDER_BUTTON_TEXT = /^(pesan|book)$/i
export const SOLD_OUT_TEXT = /^(terjual habis|sold out)$/i

const DEFAULT_CATEGORY_PRIORITY = ["cat 6", "last forever fan", "festival", "cat 1"]

export const runPackages = Effect.gen(function* () {
  const store = yield* CustomerStore
  const customer = yield* store.get()
  const buyCount = customer.ticketCount
  const categories =
    customer.categories.length > 0 ? customer.categories : DEFAULT_CATEGORY_PRIORITY

  const page = new Page(document)

  const cards = page.getByTestId("package-card").filter({ visible: true })
  const count = yield* cards.count()
  const available: Array<{ title: string; card: Locator; selectButton: Locator }> = []

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
    yield* Effect.logDebug("No packages available")
    return yield* new NoPackageAvailable()
  }

  yield* Effect.logInfo(
    "Available packages",
    available.map((p) => p.title),
  )

  const sheet = page.getByTestId("bottom-sheet-body").filter({ visible: true })

  for (const priority of categories) {
    const match = available.find((pkg) =>
      pkg.title.toLowerCase().includes(priority.toLowerCase()),
    )
    if (!match) {
      yield* Effect.logDebug("No package found for", priority)
      continue
    }

    yield* Effect.logInfo("Package found for", priority, match.title)

    yield* match.selectButton.click({ timeout: Duration.infinity })
    yield* Effect.logInfo("Opening", match.title)
    yield* sheet.waitFor({ state: "visible", timeout: Duration.infinity })
    // Have to wait for the sliding up animation
    yield* Effect.sleep(Duration.millis(200))

    const verifyButton = sheet
      .getByRole("button", { name: VERIFY_BUTTON_TEXT, disabled: false })
      .first()
    if ((yield* verifyButton.count()) > 0) {
      if (!customer.membershipCode) {
        yield* Effect.logInfo(
          "Presale code required but no membership code configured for",
          match.title,
        )
        continue
      }

      yield* Effect.logInfo("Verifying presale code for", match.title)
      const codeInput = sheet.locator('input[type="text"]').filter({ visible: true }).first()
      yield* codeInput.fill(customer.membershipCode, { timeout: Duration.infinity })
      yield* verifyButton.click({ timeout: Duration.infinity })

      const quantityEditor = sheet
        .locator('[data-testid^="ticket-qty-editor-"]')
        .filter({ visible: true })
        .first()
      yield* quantityEditor.waitFor({ state: "visible", timeout: Duration.infinity })
      yield* Effect.sleep(Duration.millis(200))
    }

    const quantityInput = sheet.locator('input[type="number"]').filter({ visible: true }).first()
    const quantityEditor = sheet
      .locator('[data-testid^="ticket-qty-editor-"]')
      .filter({ visible: true })
      .first()

    const decrementButton = quantityEditor.locator('button[type="button"]').nth(0)
    const incrementButton = quantityEditor.locator('button[type="button"]').nth(1)

    for (let attempts = 0; attempts < buyCount; attempts++) {
      const current = Number.parseInt(yield* quantityInput.inputValue(), 10)
      if (current === buyCount) break
      if (Number.isNaN(current)) {
        yield* Effect.logInfo("Quantity input is invalid for", match.title)
        break
      }

      if (current < buyCount) {
        yield* incrementButton.click({ timeout: Duration.infinity })
      } else {
        yield* decrementButton.click({ timeout: Duration.infinity })
      }

      yield* Effect.sleep(Duration.millis(10))
      const next = Number.parseInt(yield* quantityInput.inputValue(), 10)

      if (next === current) break
    }

    const quantity = Number.parseInt(yield* quantityInput.inputValue(), 10)
    if (quantity !== buyCount) {
      yield* Effect.logInfo(
        "Quantity",
        buyCount,
        "not available for",
        match.title,
        ". Found",
        quantity,
      )
      continue
    }

    yield* sheet
      .getByRole("button", { name: ORDER_BUTTON_TEXT, disabled: false })
      .first()
      .click({ timeout: Duration.infinity })
    yield* Effect.logInfo("Ordered", buyCount, "from", match.title)
    return "submitted" as const
  }

  yield* Effect.logDebug("No priority package available, exiting")
  return yield* new NoPackageAvailable()
})
