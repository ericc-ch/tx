import { ContentLive } from "@/lib/rpc"
import { BrowserRuntime } from "@effect/platform-browser"
import { Duration, Effect } from "effect"
import { readAutobuyPage, setExpandedQuantity, type PackageOption } from "./parse"

const CATEGORY_PRIORITY = ["festival", "last forever fan", "cat 1"]
const BUY_COUNT = 1

const matchesPriority = (title: string, priority: string) =>
  title.toLowerCase().includes(priority.toLowerCase())

const availablePackage = (packages: PackageOption[], priority?: string) =>
  packages.find(
    (pkg) =>
      !pkg.soldOut &&
      pkg.pilihButton &&
      (!priority || matchesPriority(pkg.title, priority)),
  )

const orderExpanded = (title: string, logSuffix = "") =>
  Effect.gen(function* () {
    const page = readAutobuyPage()
    const input = page.phase === "packages" ? page.expanded?.quantityInput : undefined
    if (!input) return false

    if (!setExpandedQuantity(input, BUY_COUNT)) {
      yield* Effect.logInfo(
        `Quantity ${BUY_COUNT} not available for "${title}"${logSuffix}`,
      )
      return false
    }

    while (true) {
      const next = readAutobuyPage()
      const pesan = next.phase === "packages" ? next.pesanButton : undefined
      if (pesan) {
        pesan.click()
        yield* Effect.logInfo(`Ordered ${BUY_COUNT} from "${title}"${logSuffix}`)
        return true
      }
      yield* Effect.sleep(Duration.millis(20))
    }
  })

const tryPriority = (priority: string) =>
  Effect.gen(function* () {
    const page = readAutobuyPage()
    if (page.phase !== "packages") return false

    if (page.expanded && matchesPriority(page.expanded.title, priority)) {
      return yield* orderExpanded(page.expanded.title)
    }

    const match = availablePackage(page.packages, priority)
    if (!match?.pilihButton) {
      yield* Effect.logInfo(`No available package for priority "${priority}"`)
      return false
    }

    match.pilihButton.click()
    yield* Effect.logInfo(`Clicked Pilih for "${match.title}"`)

    while (true) {
      const next = readAutobuyPage()
      const expanded =
        next.phase === "packages" &&
        next.expanded &&
        matchesPriority(next.expanded.title, priority)
          ? next.expanded
          : undefined
      if (expanded) return yield* orderExpanded(expanded.title)
      yield* Effect.sleep(Duration.millis(20))
    }
  })

const runOverview = Effect.gen(function* () {
  while (true) {
    const page = readAutobuyPage()
    if (page.phase === "overview" && page.buyButton) {
      page.buyButton.click()
      yield* Effect.logInfo('Clicked "Beli tiket sekarang"')
      return
    }
    yield* Effect.sleep(Duration.millis(20))
  }
})

const runPackages = Effect.gen(function* () {
  for (const priority of CATEGORY_PRIORITY) {
    if (yield* tryPriority(priority)) return
  }

  yield* Effect.logInfo("Falling back to first available package")
  const page = readAutobuyPage()
  if (page.phase !== "packages") return

  const match = availablePackage(page.packages)
  if (!match?.pilihButton) {
    yield* Effect.logInfo("No available packages, waiting...")
    return
  }

  match.pilihButton.click()
  yield* Effect.logInfo(`Clicked Pilih for "${match.title}" (fallback)`)

  while (true) {
    const next = readAutobuyPage()
    const expanded = next.phase === "packages" ? next.expanded : undefined
    if (expanded) {
      yield* orderExpanded(expanded.title, " (fallback)")
      return
    }
    yield* Effect.sleep(Duration.millis(20))
  }
})

const runStep = Effect.gen(function* () {
  const { phase } = readAutobuyPage()
  yield* Effect.logInfo(`Autobuy step (phase: ${phase ?? "unknown"})`)

  switch (phase) {
    case "overview":
      return yield* runOverview
    case "packages":
      return yield* runPackages
    case "order":
      yield* Effect.logInfo("Reached order page — autobuy complete")
      return "done" as const
    default:
      yield* Effect.logInfo("Unknown page, waiting...")
  }
})

const main = Effect.gen(function* () {
  yield* Effect.logInfo(
    `Autobuy started (priorities: ${CATEGORY_PRIORITY.join(", ")}, count: ${BUY_COUNT})`,
  )

  while (true) {
    const result = yield* runStep
    if (result === "done") break
    yield* Effect.sleep(Duration.millis(50))
  }
})

export default defineContentScript({
  matches: ["*://www.tiket.com/*", "*://localhost/*"],
  main() {
    main.pipe(Effect.provide(ContentLive), BrowserRuntime.runMain)
  },
})
