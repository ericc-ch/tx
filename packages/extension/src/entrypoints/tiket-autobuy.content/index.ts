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

type PackageOption = {
  title: string
  soldOut: boolean
  pilihButton?: Locator
}

type ExpandedSelection = {
  title: string
  quantityInput: Locator
  min: number
  max?: number
}

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

const findBuyButton = (page: Page) =>
  firstLocator(page.getByRole("button", { name: BUY_BUTTON_TEXT, disabled: false }))

const packageCards = (page: Page) =>
  Effect.gen(function* () {
    for (const selector of PACKAGE_LAYOUT_ROOTS) {
      const root = yield* firstLocator(page.locator(selector, { visible: true }))
      if (root) return root.locator('[data-testid="package-card"]').filter({ visible: true })
    }
    return page.locator('[data-testid="package-card"]', { visible: true })
  })

const packageTitle = (card: Locator) => textContent(card.locator("h3").first())

const pilihButtonInCard = (card: Locator) =>
  firstLocator(
    card.locator('[data-testid="package-card-footer"]').getByRole("button", {
      name: PILIH_TEXT,
      disabled: false,
    }),
  )

const readPackageOptions = (page: Page) =>
  Effect.gen(function* () {
    const cards = yield* packageCards(page)
    const count = yield* cards.count()
    const packages: PackageOption[] = []

    for (let index = 0; index < count; index++) {
      const card = cards.nth(index)
      const footer = yield* textContent(card.locator('[data-testid="package-card-footer"]').first())
      const soldOut = footer.includes("Terjual habis")
      const option: PackageOption = {
        title: yield* packageTitle(card),
        soldOut,
      }
      if (!soldOut) {
        const pilihButton = yield* pilihButtonInCard(card)
        if (pilihButton) option.pilihButton = pilihButton
      }
      packages.push(option)
    }

    return packages
  })

const readExpandedSelection = (page: Page) =>
  Effect.gen(function* () {
    const cards = yield* packageCards(page)
    const count = yield* cards.count()

    for (let index = 0; index < count; index++) {
      const card = cards.nth(index)
      const quantityInput = yield* firstLocator(
        card.locator('input[type="number"]').filter({ visible: true }),
      )
      if (!quantityInput) continue

      const max = Number(yield* quantityInput.getAttribute("max"))
      const selection: ExpandedSelection = {
        title: yield* packageTitle(card),
        quantityInput,
        min: Number(yield* quantityInput.getAttribute("min")) || 1,
      }
      if (Number.isFinite(max)) selection.max = max
      return selection
    }

    return undefined
  })

const findPesanButton = (page: Page) =>
  firstLocator(page.getByRole("button", { name: PESAN_TEXT, disabled: false }))

const readAutobuyPage = (page = new Page(document)) =>
  Effect.gen(function* () {
    const phase = getPagePhase()

    switch (phase) {
      case "overview": {
        const buyButton = yield* findBuyButton(page)
        return buyButton ? { phase, buyButton } : { phase }
      }
      case "packages": {
        const expanded = yield* readExpandedSelection(page)
        const pesanButton = yield* findPesanButton(page)
        return {
          phase,
          packages: yield* readPackageOptions(page),
          ...(expanded ? { expanded } : {}),
          ...(pesanButton ? { pesanButton } : {}),
        }
      }
      case "order":
        return { phase }
      default:
        return { phase: undefined }
    }
  })

const setExpandedQuantity = (input: Locator, count: number) =>
  Effect.gen(function* () {
    const max = Number(yield* input.getAttribute("max"))
    const min = Number(yield* input.getAttribute("min")) || 1
    if (!Number.isFinite(count) || count < min) return false
    if (Number.isFinite(max) && count > max) return false

    yield* input.fill(String(count))
    return Number(yield* input.inputValue()) === count
  })

const CATEGORY_PRIORITY = ["festival", "last forever fan", "cat 1"]
const BUY_COUNT = 1

const matchesPriority = (title: string, priority: string) =>
  title.toLowerCase().includes(priority.toLowerCase())

const availablePackage = (packages: PackageOption[], priority?: string) =>
  packages.find(
    (pkg) => !pkg.soldOut && pkg.pilihButton && (!priority || matchesPriority(pkg.title, priority)),
  )

const orderExpanded = (title: string, logSuffix = "") =>
  Effect.gen(function* () {
    const page = yield* readAutobuyPage()
    const input = page.phase === "packages" ? page.expanded?.quantityInput : undefined
    if (!input) return false

    if (!(yield* setExpandedQuantity(input, BUY_COUNT))) {
      yield* Effect.logInfo(`Quantity ${BUY_COUNT} not available for "${title}"${logSuffix}`)
      return false
    }

    while (true) {
      const next = yield* readAutobuyPage()
      const pesan = next.phase === "packages" ? next.pesanButton : undefined
      if (pesan) {
        yield* pesan.click()
        yield* Effect.logInfo(`Ordered ${BUY_COUNT} from "${title}"${logSuffix}`)
        return true
      }
      yield* Effect.sleep(Duration.millis(20))
    }
  })

const tryPriority = (priority: string) =>
  Effect.gen(function* () {
    const page = yield* readAutobuyPage()
    if (page.phase !== "packages") return false

    if (page.expanded && matchesPriority(page.expanded.title, priority)) {
      return yield* orderExpanded(page.expanded.title)
    }

    const match = availablePackage(page.packages, priority)
    if (!match?.pilihButton) {
      yield* Effect.logInfo(`No available package for priority "${priority}"`)
      return false
    }

    yield* match.pilihButton.click()
    yield* Effect.logInfo(`Clicked Pilih for "${match.title}"`)

    while (true) {
      const next = yield* readAutobuyPage()
      const expanded =
        next.phase === "packages" && next.expanded && matchesPriority(next.expanded.title, priority)
          ? next.expanded
          : undefined
      if (expanded) return yield* orderExpanded(expanded.title)
      yield* Effect.sleep(Duration.millis(20))
    }
  })

const runOverview = Effect.gen(function* () {
  while (true) {
    const page = yield* readAutobuyPage()
    if (page.phase === "overview" && page.buyButton) {
      yield* page.buyButton.click()
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
  const page = yield* readAutobuyPage()
  if (page.phase !== "packages") return

  const match = availablePackage(page.packages)
  if (!match?.pilihButton) {
    yield* Effect.logInfo("No available packages, waiting...")
    return
  }

  yield* match.pilihButton.click()
  yield* Effect.logInfo(`Clicked Pilih for "${match.title}" (fallback)`)

  while (true) {
    const next = yield* readAutobuyPage()
    const expanded = next.phase === "packages" ? next.expanded : undefined
    if (expanded) {
      yield* orderExpanded(expanded.title, " (fallback)")
      return
    }
    yield* Effect.sleep(Duration.millis(20))
  }
})

const runStep = Effect.gen(function* () {
  const { phase } = yield* readAutobuyPage()
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
