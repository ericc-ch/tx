import { findDisplayedByText, isDisplayed } from "@/lib/html"

const BUY_BUTTON_TEXT = /beli\s+tiket\s+sekarang/i
const PILIH_TEXT = /^pilih$/i
const PESAN_TEXT = /^pesan$/i

const PACKAGE_LAYOUT_ROOTS = [
  '[data-testid="package-selection"]',
  '[class*="package_grouping_mobile"]',
  '[class*="package_grouping_desktop"]',
  '[class*="PackageSelectionDefault_package_wrapper"]',
]

export type AutobuyPage =
  | { phase: "overview"; buyButton?: HTMLButtonElement }
  | {
      phase: "packages"
      packages: PackageOption[]
      expanded?: ExpandedSelection
      pesanButton?: HTMLButtonElement
    }
  | { phase: "order" }
  | { phase: undefined }

export type PackageOption = {
  title: string
  soldOut: boolean
  pilihButton?: HTMLButtonElement
}

export type ExpandedSelection = {
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

export const readAutobuyPage = (): AutobuyPage => {
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

export const setExpandedQuantity = (input: HTMLInputElement, count: number) => {
  const max = Number(input.max)
  const min = Number(input.min) || 1
  if (!Number.isFinite(count) || count < min) return false
  if (Number.isFinite(max) && count > max) return false

  input.value = String(count)
  input.dispatchEvent(new Event("input", { bubbles: true }))
  input.dispatchEvent(new Event("change", { bubbles: true }))

  return Number(input.value) === count
}
