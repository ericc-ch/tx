import { findDisplayedByText, isDisplayed } from "@/lib/html"
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

type AutobuyPage =
  | { phase: "overview"; buyButton?: HTMLButtonElement }
  | {
      phase: "packages"
      packages: PackageOption[]
      expanded?: ExpandedSelection
      pesanButton?: HTMLButtonElement
    }
  | { phase: "order" }
  | { phase: undefined }

type PackageOption = {
  title: string
  soldOut: boolean
  pilihButton?: HTMLButtonElement
}

type ExpandedSelection = {
  title: string
  quantityInput: HTMLInputElement
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

const findBuyButton = () => {
  const el = findDisplayedByText(document.querySelectorAll("button"), BUY_BUTTON_TEXT)
  return el instanceof HTMLButtonElement ? el : undefined
}

const packageCards = () => {
  let root: HTMLElement | undefined
  for (const selector of PACKAGE_LAYOUT_ROOTS) {
    for (const el of document.querySelectorAll(selector)) {
      if (el instanceof HTMLElement && isDisplayed(el)) {
        root = el
        break
      }
    }
    if (root) break
  }
  const scope = root ?? document
  return [...scope.querySelectorAll('[data-testid="package-card"]')].filter(
    (card): card is HTMLElement => card instanceof HTMLElement && isDisplayed(card),
  )
}

const packageTitle = (card: Element) => card.querySelector("h3")?.textContent?.trim() ?? ""

const pilihButtonInCard = (card: Element) => {
  const btn = findDisplayedByText(
    card.querySelectorAll('[data-testid="package-card-footer"] button'),
    PILIH_TEXT,
  )
  return btn instanceof HTMLButtonElement ? btn : undefined
}

const readPackageOptions = (): PackageOption[] =>
  packageCards().map((card) => {
    const soldOut = card
      .querySelector('[data-testid="package-card-footer"]')
      ?.textContent?.includes("Terjual habis")
    const option: PackageOption = { title: packageTitle(card), soldOut: !!soldOut }
    if (!soldOut) {
      const pilihButton = pilihButtonInCard(card)
      if (pilihButton) option.pilihButton = pilihButton
    }
    return option
  })

const readExpandedSelection = (): ExpandedSelection | undefined => {
  for (const input of document.querySelectorAll('input[type="number"]')) {
    if (!(input instanceof HTMLInputElement)) continue
    if (!isDisplayed(input)) continue

    const card = input.closest('[data-testid="package-card"]')
    if (!(card instanceof HTMLElement) || !isDisplayed(card)) continue

    const max = Number(input.max)
    const selection: ExpandedSelection = {
      title: packageTitle(card),
      quantityInput: input,
      min: Number(input.min) || 1,
    }
    if (Number.isFinite(max)) selection.max = max
    return selection
  }
  return undefined
}

const findPesanButton = () => {
  const el = findDisplayedByText(document.querySelectorAll("button"), PESAN_TEXT)
  return el instanceof HTMLButtonElement ? el : undefined
}

const readAutobuyPage = (): AutobuyPage => {
  const phase = getPagePhase()

  switch (phase) {
    case "overview": {
      const buyButton = findBuyButton()
      return buyButton ? { phase, buyButton } : { phase }
    }
    case "packages": {
      const expanded = readExpandedSelection()
      const pesanButton = findPesanButton()
      return {
        phase,
        packages: readPackageOptions(),
        ...(expanded ? { expanded } : {}),
        ...(pesanButton ? { pesanButton } : {}),
      }
    }
    case "order":
      return { phase }
    default:
      return { phase: undefined }
  }
}

const setExpandedQuantity = (input: HTMLInputElement, count: number) => {
  const max = Number(input.max)
  const min = Number(input.min) || 1
  if (!Number.isFinite(count) || count < min) return false
  if (Number.isFinite(max) && count > max) return false

  input.value = String(count)
  input.dispatchEvent(new Event("input", { bubbles: true }))
  input.dispatchEvent(new Event("change", { bubbles: true }))

  return Number(input.value) === count
}

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
