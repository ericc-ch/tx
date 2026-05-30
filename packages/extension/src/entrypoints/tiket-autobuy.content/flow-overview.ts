import { Duration, Effect } from "effect"

const isOverviewPath = (pathname: string) => {
  const base = pathname.replace(/\/$/, "")
  return base.includes("/to-do/") && !base.endsWith("/packages") && !base.endsWith("/order")
}

export const resetToOverview = Effect.gen(function* () {
  const { pathname, search } = location
  if (isOverviewPath(pathname)) return

  const base = pathname.replace(/\/$/, "")
  if (!base.endsWith("/packages") && !base.endsWith("/order")) return

  const overviewBase = base.endsWith("/order")
    ? base.slice(0, -"/order".length)
    : base.slice(0, -"/packages".length)
  const overviewUrl = `${overviewBase}${search}`

  yield* Effect.sync(() => location.assign(overviewUrl))
  yield* Effect.logInfo("Resetting to overview", overviewUrl)

  while (!isOverviewPath(location.pathname)) {
    yield* Effect.sleep(Duration.millis(100))
  }
})

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
