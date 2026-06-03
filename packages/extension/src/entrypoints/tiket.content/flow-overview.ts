import { Effect } from "effect"
import { overviewUrl, packagesUrl } from "./routing"
import { waitForPageKind } from "./wait-for-page"

export const resetToOverview = Effect.gen(function* () {
  const url = overviewUrl(location)
  if (!url) return

  yield* Effect.sync(() => location.assign(url))
  yield* Effect.logDebug("Resetting to overview", url)
  yield* waitForPageKind("overview")
})

export const runOverview = Effect.gen(function* () {
  const url = packagesUrl(location)
  if (!url) return

  yield* Effect.sync(() => location.assign(url))
  yield* Effect.logDebug("Navigating to", url)
})
