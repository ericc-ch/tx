import { Locator, Page } from "@/lib/playwlite"
import { Duration, Effect } from "effect"

export const SELECT_BUTTON_TEXT = /^(pilih|select)$/i
export const ORDER_BUTTON_TEXT = /^(pesan|book)$/i
export const SOLD_OUT_TEXT = /^(terjual habis|sold out)$/i

const CATEGORY_PRIORITY = ["cat 6", "last forever fan", "festival"]
const BUY_COUNT = 6

export const runPackages = Effect.gen(function* () {
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

    const selectButton = footer
      .getByRole("button", { name: SELECT_BUTTON_TEXT, disabled: false })
      .first()

    available.push({ title, card, selectButton })
  }

  yield* Effect.logInfo(
    "Available packages",
    available.map((p) => p.title),
  )

  for (const priority of CATEGORY_PRIORITY) {
    const match = available.find((pkg) => pkg.title.toLowerCase().includes(priority.toLowerCase()))
    if (!match) {
      yield* Effect.logInfo("No package found for", priority)
      continue
    }

    yield* Effect.logInfo("Package found for", priority, match.title)

    const quantityInput = match.card
      .locator('input[type="number"]')
      .filter({ visible: true })
      .first()
    const quantityEditor = match.card
      .locator('[data-testid^="ticket-qty-editor-"]')
      .filter({ visible: true })
      .first()

    if (!(yield* quantityInput.isVisible())) {
      yield* match.selectButton.click({ timeout: Duration.infinity })
      yield* Effect.logInfo("Expanding", match.title)
      yield* quantityInput.waitFor({ state: "visible", timeout: Duration.infinity })
    }

    const decrementButton = quantityEditor.locator('button[type="button"]').nth(0)
    const incrementButton = quantityEditor.locator('button[type="button"]').nth(1)

    for (let attempts = 0; attempts < BUY_COUNT; attempts++) {
      const current = Number.parseInt(yield* quantityInput.inputValue(), 10)
      if (current === BUY_COUNT) break
      if (Number.isNaN(current)) {
        yield* Effect.logInfo("Quantity input is invalid for", match.title)
        break
      }

      if (current < BUY_COUNT) {
        yield* incrementButton.click({ timeout: Duration.infinity })
      } else {
        yield* decrementButton.click({ timeout: Duration.infinity })
      }

      const next = Number.parseInt(yield* quantityInput.inputValue(), 10)
      if (next === current) break
    }

    const quantity = Number.parseInt(yield* quantityInput.inputValue(), 10)
    if (quantity !== BUY_COUNT) {
      yield* Effect.logInfo("Quantity", BUY_COUNT, "not available for", match.title)
      continue
    }

    yield* match.card
      .getByRole("button", { name: ORDER_BUTTON_TEXT, disabled: false })
      .first()
      .click({ timeout: Duration.infinity })
    yield* Effect.logInfo("Ordered", BUY_COUNT, "from", match.title)
    return
  }

  yield* Effect.logInfo("No priority package available, exiting")
})
