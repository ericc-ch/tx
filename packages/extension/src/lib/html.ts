export const isVisible = (el: HTMLElement) => {
  if (el.offsetParent !== null) return true
  const style = getComputedStyle(el)
  return style.display !== "none" && style.visibility !== "hidden"
}

export const isDisplayed = (el: HTMLElement) => {
  if (!isVisible(el)) return false
  const { width, height } = el.getBoundingClientRect()
  return width > 0 && height > 0
}

export const elementText = (el: HTMLElement) => {
  if (!isDisplayed(el)) return ""

  const inner = "innerText" in el ? el.innerText : undefined
  if (inner?.trim()) return inner.trim()
  return el.textContent?.trim() ?? ""
}

export const findDisplayedByText = (elements: Iterable<Element>, pattern: RegExp) => {
  for (const el of elements) {
    if (!(el instanceof HTMLElement)) continue
    if (el instanceof HTMLButtonElement && el.disabled) continue
    if (!pattern.test(elementText(el))) continue
    return el
  }
  return undefined
}
