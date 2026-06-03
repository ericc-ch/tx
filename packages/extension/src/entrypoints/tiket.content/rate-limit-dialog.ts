import { Page } from "@/lib/playwlite"
import { Effect } from "effect"

export const RATE_LIMIT_RETRY = /^(retry|coba lagi)$/i

export const isPresent = Effect.gen(function* () {
  const page = new Page(document)
  return (
    (yield* page
      .getByRole("button", { name: RATE_LIMIT_RETRY })
      .filter({ visible: true })
      .count()) > 0
  )
})

export const clickRetryWhenReady = Effect.gen(function* () {
  const page = new Page(document)
  const retry = page.getByRole("button", { name: RATE_LIMIT_RETRY }).first()
  yield* retry.click()
  yield* Effect.logDebug("Clicked rate-limit dialog retry")
})

export const handleIfPresent = Effect.gen(function* () {
  if (!(yield* isPresent)) return false
  yield* clickRetryWhenReady
  return true
})
