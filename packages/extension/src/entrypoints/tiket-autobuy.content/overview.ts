import { Page } from "@/lib/playwlite"
import { Effect } from "effect"

const BUY_BUTTON_TEXT = /(?:beli\s+tiket\s+sekarang|buy\s+ticket\s+now)/i

export const findOverviewBuyButton = (page: Page) =>
  Effect.gen(function* () {
    const locator = page.getByRole("button", { name: BUY_BUTTON_TEXT, disabled: false })
    return (yield* locator.count()) > 0 ? locator.first() : undefined
  })
