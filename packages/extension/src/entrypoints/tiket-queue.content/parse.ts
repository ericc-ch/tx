import { Page } from "@/lib/playwlite"
import { Effect } from "effect"

const CUSTOM_PEOPLE_AHEAD_SELECTOR = "#CustomQueueSection_NumberOfPeopleAhead > span"
const USERS_AHEAD_SELECTOR = "#MainPart_lbUsersInLineAheadOfYou"

const tryRead = (page: Page, source: string, selector: string) =>
  Effect.gen(function* () {
    const locator = page.locator(selector)
    if ((yield* locator.count()) === 0) {
      return { peopleAhead: undefined, summary: `${source}: no element (${selector})` }
    }
    if (!(yield* locator.first().isVisible())) {
      return {
        peopleAhead: undefined,
        summary: `${source}: empty or hidden, raw="" (${selector})`,
      }
    }

    const raw = (yield* locator.first().textContent())?.trim() ?? ""
    if (!raw) {
      return {
        peopleAhead: undefined,
        summary: `${source}: empty or hidden, raw="" (${selector})`,
      }
    }

    let peopleAhead: number | undefined
    if (/^\d{1,3}(\.\d{3})+$/.test(raw)) {
      peopleAhead = Number.parseInt(raw.replaceAll(".", ""), 10)
    } else if (/^\d{1,3}(,\d{3})+$/.test(raw)) {
      peopleAhead = Number.parseInt(raw.replaceAll(",", ""), 10)
    } else {
      const parsed = Number.parseInt(raw.replaceAll(",", ""), 10)
      if (Number.isInteger(parsed) && parsed >= 1) {
        peopleAhead = parsed
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
      summary: `${source}: raw="${raw}" -> ${peopleAhead}`,
    }
  })

export const readPeopleAhead = (page = new Page(document)) =>
  Effect.gen(function* () {
    const custom = yield* tryRead(page, "custom", CUSTOM_PEOPLE_AHEAD_SELECTOR)
    if (custom.peopleAhead !== undefined) return custom

    const fallback = yield* tryRead(page, "default", USERS_AHEAD_SELECTOR)
    if (fallback.peopleAhead !== undefined) return fallback

    return {
      peopleAhead: undefined,
      summary: `${custom.summary}; ${fallback.summary}`,
    }
  })
