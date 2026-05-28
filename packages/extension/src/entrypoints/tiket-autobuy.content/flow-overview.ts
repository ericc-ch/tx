import { Effect } from "effect"

export const runOverview = Effect.gen(function* () {
  const { pathname, search } = location
  const base = pathname.replace(/\/$/, "")
  if (base.endsWith("/packages")) return

  const packagesUrl = `${base}/packages${search}`
  yield* Effect.sync(() => {
    location.assign(packagesUrl)
  })
  yield* Effect.logInfo("Navigating to", packagesUrl)
})
