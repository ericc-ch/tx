import { elementText } from "@/lib/html"

const CUSTOM_PEOPLE_AHEAD_SELECTOR =
  "#CustomQueueSection_NumberOfPeopleAhead > span"
const USERS_AHEAD_SELECTOR = "#MainPart_lbUsersInLineAheadOfYou"

const tryRead = (source: string, selector: string) => {
  const el = document.querySelector(selector)
  if (!(el instanceof HTMLElement)) {
    return { peopleAhead: undefined, summary: `${source}: no element (${selector})` }
  }

  const raw = elementText(el)
  if (!raw) {
    return {
      peopleAhead: undefined,
      summary: `${source}: empty or hidden, raw="" (${selector})`,
    }
  }

  const trimmed = raw.trim()
  let peopleAhead: number | undefined
  if (trimmed) {
    if (/^\d{1,3}(\.\d{3})+$/.test(trimmed)) {
      peopleAhead = Number(trimmed.replaceAll(".", ""))
    } else if (/^\d{1,3}(,\d{3})+$/.test(trimmed)) {
      peopleAhead = Number(trimmed.replaceAll(",", ""))
    } else {
      const parsed = Number(trimmed.replaceAll(",", ""))
      if (Number.isInteger(parsed) && parsed >= 1) {
        peopleAhead = parsed
      }
    }
  }

  if (peopleAhead === undefined) {
    return {
      peopleAhead: undefined,
      summary: `${source}: unparsable raw="${raw}" (${selector})`,
    }
  }

  return {
    peopleAhead,
    summary: `${source}: raw="${raw}" → ${peopleAhead}`,
  }
}

export const readPeopleAhead = () => {
  const custom = tryRead("custom", CUSTOM_PEOPLE_AHEAD_SELECTOR)
  if (custom.peopleAhead !== undefined) return custom

  const fallback = tryRead("default", USERS_AHEAD_SELECTOR)
  if (fallback.peopleAhead !== undefined) return fallback

  return {
    peopleAhead: undefined,
    summary: `${custom.summary}; ${fallback.summary}`,
  }
}
