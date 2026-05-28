import { Locator, Page } from "@/lib/playwlite"
import { Duration, Effect } from "effect"

export const SELECT_BUTTON_TEXT = /^(pilih|select)$/i
export const ORDER_BUTTON_TEXT = /^(pesan|book)$/i
export const SOLD_OUT_TEXT = /^(terjual habis|sold out)$/i

const CATEGORY_PRIORITY = ["cat 6", "last forever fan", "festival"]
const BUY_COUNT = 1

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
      yield* Effect.logInfo(`No available package for priority "${priority}"`)
      continue
    }

    const quantityInput = match.card
      .locator('input[type="number"]')
      .filter({ visible: true })
      .first()

    if (!(yield* quantityInput.isVisible())) {
      yield* match.selectButton.click({ timeout: Duration.infinity })
      yield* Effect.logInfo(`Clicked Select for "${match.title}"`)
      yield* quantityInput.waitFor({ state: "attached", timeout: Duration.infinity })
    }

    yield* quantityInput.fill(BUY_COUNT.toString(), { timeout: Duration.infinity })
    if (Number.parseInt(yield* quantityInput.inputValue(), 10) !== BUY_COUNT) {
      yield* Effect.logInfo(`Quantity ${BUY_COUNT} not available for "${match.title}"`)
      continue
    }

    yield* match.card
      .getByRole("button", { name: ORDER_BUTTON_TEXT, disabled: false })
      .first()
      .click({ timeout: Duration.infinity })
    yield* Effect.logInfo(`Ordered ${BUY_COUNT} from "${match.title}"`)
    return
  }

  yield* Effect.logInfo("No priority package available, exiting")
})
