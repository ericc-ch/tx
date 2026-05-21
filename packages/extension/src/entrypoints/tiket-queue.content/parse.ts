const USERS_AHEAD_SELECTOR = "#MainPart_lbUsersInLineAheadOfYou"

const elementText = (el: HTMLElement) => {
  if ("innerText" in HTMLElement.prototype) return el.innerText.trim()
  const style = getComputedStyle(el)
  if (style.display === "none" || style.visibility === "hidden") return ""
  return el.textContent?.trim() ?? ""
}

export const readPeopleAhead = () => {
  const el = document.querySelector(USERS_AHEAD_SELECTOR)
  if (!(el instanceof HTMLElement)) return undefined

  const raw = elementText(el)
  if (!raw) return undefined

  const peopleAhead = Number(raw.replaceAll(",", ""))
  if (!Number.isInteger(peopleAhead) || peopleAhead < 1) return undefined

  return { peopleAhead }
}
