import { Locator, Page } from "@/lib/playwlite"
import { Duration, Effect } from "effect"

export const SELECT_BUTTON_TEXT = /^(pilih|select)$/i
export const ORDER_BUTTON_TEXT = /^(pesan|order)$/i
export const SOLD_OUT_TEXT = /^(terjual habis|sold out)$/i

const CATEGORY_PRIORITY = ["festival", "last forever fan", "cat 1"]
const BUY_COUNT = 1
const WAIT_FOREVER = { timeout: Duration.infinity }

export const runPackages = Effect.gen(function* () {
  const page = new Page(document)

  for (const priority of CATEGORY_PRIORITY) {
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

    const match = available.find((pkg) =>
      pkg.title.toLowerCase().includes(priority.toLowerCase()),
    )
    if (!match) {
      yield* Effect.logInfo(`No available package for priority "${priority}"`)
      continue
    }

    const quantityInput = match.card
      .locator('input[type="number"]')
      .filter({ visible: true })
      .first()

    if (!(yield* quantityInput.isVisible())) {
      yield* match.selectButton.click(WAIT_FOREVER)
      yield* Effect.logInfo(`Clicked Select for "${match.title}"`)
      yield* quantityInput.waitFor({ state: "visible", ...WAIT_FOREVER })
    }

    const max = Number(yield* quantityInput.getAttribute("max"))
    const min = Number(yield* quantityInput.getAttribute("min")) || 1
    if (!Number.isFinite(BUY_COUNT) || BUY_COUNT < min) continue
    if (Number.isFinite(max) && BUY_COUNT > max) continue

    yield* quantityInput.fill(String(BUY_COUNT), WAIT_FOREVER)
    if (Number(yield* quantityInput.inputValue()) !== BUY_COUNT) {
      yield* Effect.logInfo(
        `Quantity ${BUY_COUNT} not available for "${match.title}"`,
      )
      continue
    }

    yield* page
      .getByRole("button", { name: ORDER_BUTTON_TEXT, disabled: false })
      .first()
      .click(WAIT_FOREVER)
    yield* Effect.logInfo(`Ordered ${BUY_COUNT} from "${match.title}"`)
    return
  }

  yield* Effect.logInfo("Falling back to first available package")

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

  const match = available[0]
  if (!match) {
    yield* Effect.logInfo("No available packages, waiting...")
    return
  }

  const quantityInput = match.card
    .locator('input[type="number"]')
    .filter({ visible: true })
    .first()

  if (!(yield* quantityInput.isVisible())) {
    yield* match.selectButton.click(WAIT_FOREVER)
    yield* Effect.logInfo(`Clicked Select for "${match.title}" (fallback)`)
    yield* quantityInput.waitFor({ state: "visible", ...WAIT_FOREVER })
  }

  const max = Number(yield* quantityInput.getAttribute("max"))
  const min = Number(yield* quantityInput.getAttribute("min")) || 1
  if (!Number.isFinite(BUY_COUNT) || BUY_COUNT < min) return
  if (Number.isFinite(max) && BUY_COUNT > max) return

  yield* quantityInput.fill(String(BUY_COUNT), WAIT_FOREVER)
  if (Number(yield* quantityInput.inputValue()) !== BUY_COUNT) {
    yield* Effect.logInfo(
      `Quantity ${BUY_COUNT} not available for "${match.title}" (fallback)`,
    )
    return
  }

  yield* page
    .getByRole("button", { name: ORDER_BUTTON_TEXT, disabled: false })
    .first()
    .click(WAIT_FOREVER)
  yield* Effect.logInfo(`Ordered ${BUY_COUNT} from "${match.title}" (fallback)`)
})
