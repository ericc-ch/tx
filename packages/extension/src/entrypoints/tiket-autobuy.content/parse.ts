import { elementText, isDisplayed } from "@/lib/html"

const BUY_BUTTON_TEXT = /beli\s+tiket\s+sekarang/i
const PILIH_TEXT = /^pilih$/i
const PESAN_TEXT = /^pesan$/i

const PACKAGE_LAYOUT_ROOTS = [
  '[data-testid="package-selection"]',
  '[class*="package_grouping_mobile"]',
  '[class*="package_grouping_desktop"]',
  '[class*="PackageSelectionDefault_package_wrapper"]',
]

export const getPagePhase = () => {
  const { pathname } = location
  if (pathname.endsWith("/order")) return "order"
  if (pathname.endsWith("/packages")) return "packages"
  if (pathname.includes("/to-do/")) return "overview"
  return undefined
}

export const visiblePackageRoot = () => {
  for (const selector of PACKAGE_LAYOUT_ROOTS) {
    for (const el of document.querySelectorAll(selector)) {
      if (!(el instanceof HTMLElement)) continue
      if (!isDisplayed(el)) continue
      return el
    }
  }
  return undefined
}

export const packageCards = () => {
  const root = visiblePackageRoot()
  const scope = root ?? document
  return [...scope.querySelectorAll('[data-testid="package-card"]')].filter(
    (card): card is HTMLElement => card instanceof HTMLElement && isDisplayed(card),
  )
}

export const matchesPriority = (title: string, priority: string) =>
  title.toLowerCase().includes(priority.toLowerCase())

export const packageTitle = (card: Element) =>
  card.querySelector("h3")?.textContent?.trim() ?? ""

export const isPackageAvailable = (card: Element) => {
  const footer = card.querySelector('[data-testid="package-card-footer"]')
  if (!footer) return false
  if (footer.textContent?.includes("Terjual habis")) return false

  const btn = footer.querySelector("button")
  return (
    btn instanceof HTMLButtonElement &&
    !btn.disabled &&
    PILIH_TEXT.test(elementText(btn))
  )
}

export const pilihButtonInCard = (card: Element) => {
  const btn = card.querySelector('[data-testid="package-card-footer"] button')
  if (!(btn instanceof HTMLButtonElement)) return undefined
  if (btn.disabled) return undefined
  if (!PILIH_TEXT.test(elementText(btn))) return undefined
  return btn
}

export const findPilihForPriority = (priority: string) => {
  for (const card of packageCards()) {
    if (!isPackageAvailable(card)) continue
    if (!matchesPriority(packageTitle(card), priority)) continue
    const btn = pilihButtonInCard(card)
    if (!btn) continue
    return { button: btn, title: packageTitle(card) }
  }
  return undefined
}

export const findFirstAvailablePilih = () => {
  for (const card of packageCards()) {
    if (!isPackageAvailable(card)) continue
    const btn = pilihButtonInCard(card)
    if (!btn) continue
    return { button: btn, title: packageTitle(card) }
  }
  return undefined
}

export const findExpandedPackage = () => {
  if (!findPesanButton()) return undefined

  for (const input of document.querySelectorAll('input[type="number"]')) {
    if (!(input instanceof HTMLInputElement)) continue
    if (!isDisplayed(input)) continue

    const card = input.closest('[data-testid="package-card"]')
    if (!(card instanceof HTMLElement) || !isDisplayed(card)) continue

    return { input, title: packageTitle(card) }
  }
  return undefined
}

export const setPackageQuantity = (count: number) => {
  const expanded = findExpandedPackage()
  if (!expanded) return false

  const { input } = expanded
  const max = Number(input.max)
  const min = Number(input.min) || 1
  if (!Number.isFinite(count) || count < min) return false
  if (Number.isFinite(max) && count > max) return false

  input.value = String(count)
  input.dispatchEvent(new Event("input", { bubbles: true }))
  input.dispatchEvent(new Event("change", { bubbles: true }))

  return Number(input.value) === count
}

export const findBuyButton = () => {
  for (const el of document.querySelectorAll("button")) {
    if (!(el instanceof HTMLButtonElement)) continue
    if (el.disabled) continue
    if (!BUY_BUTTON_TEXT.test(elementText(el))) continue
    return el
  }
  return undefined
}

export const findPesanButton = () => {
  for (const el of document.querySelectorAll("button")) {
    if (!(el instanceof HTMLButtonElement)) continue
    if (el.disabled) continue
    if (!PESAN_TEXT.test(elementText(el))) continue
    return el
  }
  return undefined
}
