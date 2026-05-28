import { Page } from "@/lib/playwlite"
import { Duration, Effect, Schedule } from "effect"

const BUY_BUTTON_TEXT = /(?:beli\s+tiket\s+sekarang|buy\s+ticket\s+now)/i

export const runOverview = Effect.gen(function* () {
  const page = new Page(document)

  const buyButton = yield* Effect.gen(function* () {
    const locator = page.getByRole("button", { name: BUY_BUTTON_TEXT, disabled: false })
    return (yield* locator.count()) > 0 ? locator.first() : undefined
  }).pipe(
    Effect.repeat({
      until: (button) => button !== undefined,
      schedule: Schedule.spaced(Duration.millis(20)),
    }),
  )

  yield* buyButton.click()
  yield* Effect.logInfo(`Clicked "${(yield* buyButton.textContent())?.trim()}"`)
})
