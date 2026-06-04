import { Page } from "@/lib/playwlite"
import { BrowserRuntime } from "@effect/platform-browser"
import { Duration, Effect, Schedule } from "effect"

const pollSchedule = Schedule.spaced(Duration.seconds(1))

// Short patterns — buttons/links only (avoids clicking queue page copy).
const rolePromptPatterns = [
  /human/i,
  /robot/i,
  /\bbot\b/i,
  /still/i,
  /here/i,
  /confirm/i,
  /verify/i,
  /prove/i,
  /proceed/i,
  /continue/i,
  /yes/i,
  /press/i,
  /hold/i,
  /i\s*'?m/i,
  /not\s*bot/i,
  /real\s*person/i,
]

// Slightly longer — also try plain text nodes (div-based challenge buttons).
const textPromptPatterns = [/human/i, /robot/i, /still/i, /bot/i, /verify/i, /confirm/i]

const clickIfPresent = Effect.gen(function* () {
  const page = new Page(document)

  for (const pattern of rolePromptPatterns) {
    for (const role of ["button", "link"] as const) {
      const target = page.getByRole(role, { name: pattern }).filter({ visible: true }).first()
      if ((yield* target.count()) === 0) continue

      yield* target.click().pipe(Effect.catch(() => Effect.void))
      yield* Effect.logDebug("Clicked TTM human verification prompt")
      return
    }
  }

  for (const pattern of textPromptPatterns) {
    const textTarget = page.getByText(pattern).filter({ visible: true }).first()
    if ((yield* textTarget.count()) === 0) continue

    yield* textTarget.click().pipe(Effect.catch(() => Effect.void))
    yield* Effect.logDebug("Clicked TTM human verification prompt")
    return
  }
})

export default defineContentScript({
  matches: ["*://wait.thaiticketmajor.com/view*"],
  main() {
    clickIfPresent.pipe(Effect.repeat({ schedule: pollSchedule }), BrowserRuntime.runMain)
  },
})
