import { Duration, Effect } from "effect"
import { overviewUrl, packagesUrl, pageKind } from "./routing"

export const resetToOverview = Effect.gen(function* () {
  const url = overviewUrl(location)
  if (!url) return

  yield* Effect.sync(() => location.assign(url))
  yield* Effect.logInfo("Resetting to overview", url)

  while (pageKind(location) !== "overview") {
    yield* Effect.sleep(Duration.millis(100))
  }
})

export const runOverview = Effect.gen(function* () {
  const url = packagesUrl(location)
  if (!url) return

  yield* Effect.sync(() => location.assign(url))
  yield* Effect.logInfo("Navigating to", url)
})
