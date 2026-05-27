import { Locator, Page } from "@/lib/playwlite"
import { ContentLive } from "@/lib/rpc"
import { BrowserRuntime } from "@effect/platform-browser"
import { Duration, Effect } from "effect"

const BUY_BUTTON_TEXT = /beli\s+tiket\s+sekarang/i
const PILIH_TEXT = /^pilih$/i
const PESAN_TEXT = /^pesan$/i

const PACKAGE_LAYOUT_ROOTS = [
  '[data-testid="package-selection"]',
  '[class*="package_grouping_mobile"]',
  '[class*="package_grouping_desktop"]',
  '[class*="PackageSelectionDefault_package_wrapper"]',
]

const CATEGORY_PRIORITY = ["festival", "last forever fan", "cat 1"]
const BUY_COUNT = 1

const getPagePhase = () => {
  const { pathname } = location
  if (pathname.endsWith("/order")) return "order" as const
  if (pathname.endsWith("/packages")) return "packages" as const
  if (pathname.includes("/to-do/")) return "overview" as const
  return undefined
}

const firstLocator = (locator: Locator) =>
  Effect.gen(function* () {
    return (yield* locator.count()) > 0 ? locator.first() : undefined
  })

const textContent = (locator: Locator) =>
  Effect.gen(function* () {
    const match = yield* firstLocator(locator)
    return match ? ((yield* match.textContent())?.trim() ?? "") : ""
  })

const runOverview = Effect.gen(function* () {
  const page = new Page(document)

  while (true) {
    const buyButton = yield* firstLocator(
      page.getByRole("button", { name: BUY_BUTTON_TEXT, disabled: false }),
    )
    if (buyButton) {
      yield* buyButton.click()
      yield* Effect.logInfo('Clicked "Beli tiket sekarang"')
      return
    }
    yield* Effect.sleep(Duration.millis(20))
  }
})

const runPackages = Effect.gen(function* () {
  const page = new Page(document)

  const readPackagesPage = Effect.gen(function* () {
    let cards = page.locator('[data-testid="package-card"]', { visible: true })
    for (const selector of PACKAGE_LAYOUT_ROOTS) {
      const root = yield* firstLocator(page.locator(selector, { visible: true }))
      if (root) {
        cards = root.locator('[data-testid="package-card"]').filter({ visible: true })
        break
      }
    }

    const count = yield* cards.count()
    const packages: { title: string; soldOut: boolean; pilihButton?: Locator }[] = []
    let expanded:
      | { title: string; quantityInput: Locator; min: number; max?: number }
      | undefined

    for (let index = 0; index < count; index++) {
      const card = cards.nth(index)
      const title = yield* textContent(card.locator("h3").first())
      const footer = yield* textContent(card.locator('[data-testid="package-card-footer"]').first())
      const soldOut = footer.includes("Terjual habis")
      const pkg: (typeof packages)[number] = { title, soldOut }

      if (!soldOut) {
        const pilihButton = yield* firstLocator(
          card.locator('[data-testid="package-card-footer"]').getByRole("button", {
            name: PILIH_TEXT,
            disabled: false,
          }),
        )
        if (pilihButton) pkg.pilihButton = pilihButton
      }

      packages.push(pkg)

      if (!expanded) {
        const quantityInput = yield* firstLocator(
          card.locator('input[type="number"]').filter({ visible: true }),
        )
        if (quantityInput) {
          const max = Number(yield* quantityInput.getAttribute("max"))
          expanded = {
            title,
            quantityInput,
            min: Number(yield* quantityInput.getAttribute("min")) || 1,
          }
          if (Number.isFinite(max)) expanded.max = max
        }
      }
    }

    const pesanButton = yield* firstLocator(
      page.getByRole("button", { name: PESAN_TEXT, disabled: false }),
    )

    return { packages, expanded, pesanButton }
  })

  const orderFromExpanded = (title: string, logSuffix = "") =>
    Effect.gen(function* () {
      const state = yield* readPackagesPage
      if (!state.expanded) return false

      const input = state.expanded.quantityInput
      const max = Number(yield* input.getAttribute("max"))
      const min = Number(yield* input.getAttribute("min")) || 1
      if (!Number.isFinite(BUY_COUNT) || BUY_COUNT < min) return false
      if (Number.isFinite(max) && BUY_COUNT > max) return false

      yield* input.fill(String(BUY_COUNT))
      if (Number(yield* input.inputValue()) !== BUY_COUNT) {
        yield* Effect.logInfo(`Quantity ${BUY_COUNT} not available for "${title}"${logSuffix}`)
        return false
      }

      while (true) {
        const next = yield* readPackagesPage
        if (next.pesanButton) {
          yield* next.pesanButton.click()
          yield* Effect.logInfo(`Ordered ${BUY_COUNT} from "${title}"${logSuffix}`)
          return true
        }
        yield* Effect.sleep(Duration.millis(20))
      }
    })

  const matchesPriority = (title: string, priority: string) =>
    title.toLowerCase().includes(priority.toLowerCase())

  const availablePackage = (packages: { title: string; soldOut: boolean; pilihButton?: Locator }[], priority?: string) =>
    packages.find(
      (pkg) =>
        !pkg.soldOut && pkg.pilihButton && (!priority || matchesPriority(pkg.title, priority)),
    )

  for (const priority of CATEGORY_PRIORITY) {
    const state = yield* readPackagesPage
    if (getPagePhase() !== "packages") return

    if (state.expanded && matchesPriority(state.expanded.title, priority)) {
      if (yield* orderFromExpanded(state.expanded.title)) return
      continue
    }

    const match = availablePackage(state.packages, priority)
    if (!match?.pilihButton) {
      yield* Effect.logInfo(`No available package for priority "${priority}"`)
      continue
    }

    yield* match.pilihButton.click()
    yield* Effect.logInfo(`Clicked Pilih for "${match.title}"`)

    while (true) {
      const next = yield* readPackagesPage
      if (next.expanded && matchesPriority(next.expanded.title, priority)) {
        if (yield* orderFromExpanded(next.expanded.title)) return
        break
      }
      yield* Effect.sleep(Duration.millis(20))
    }
  }

  yield* Effect.logInfo("Falling back to first available package")
  const fallback = yield* readPackagesPage
  if (getPagePhase() !== "packages") return

  const match = availablePackage(fallback.packages)
  if (!match?.pilihButton) {
    yield* Effect.logInfo("No available packages, waiting...")
    return
  }

  yield* match.pilihButton.click()
  yield* Effect.logInfo(`Clicked Pilih for "${match.title}" (fallback)`)

  while (true) {
    const next = yield* readPackagesPage
    if (next.expanded && (yield* orderFromExpanded(next.expanded.title, " (fallback)"))) return
    yield* Effect.sleep(Duration.millis(20))
  }
})

const runOrder = Effect.gen(function* () {
  yield* Effect.logInfo("Reached order page — autobuy complete")
  return "done" as const
})

const main = Effect.gen(function* () {
  yield* Effect.logInfo(
    `Autobuy started (priorities: ${CATEGORY_PRIORITY.join(", ")}, count: ${BUY_COUNT})`,
  )

  while (true) {
    const phase = getPagePhase()
    yield* Effect.logInfo(`Autobuy step (phase: ${phase ?? "unknown"})`)

    switch (phase) {
      case "overview":
        yield* runOverview
        break
      case "packages":
        yield* runPackages
        break
      case "order": {
        const result = yield* runOrder
        if (result === "done") return
        break
      }
      default:
        yield* Effect.logInfo("Unknown page, waiting...")
    }

    yield* Effect.sleep(Duration.millis(50))
  }
})

export default defineContentScript({
  matches: ["*://www.tiket.com/*", "*://localhost/*"],
  main() {
    main.pipe(Effect.provide(ContentLive), BrowserRuntime.runMain)
  },
})
