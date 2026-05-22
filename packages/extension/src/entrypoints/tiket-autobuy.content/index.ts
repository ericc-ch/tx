import { BrowserRuntime } from "@effect/platform-browser"
import { Duration, Effect, Schedule } from "effect"
import { elementText } from "@/lib/html"
import {
  findExpandedPackage,
  findPesanButton,
  findPilih,
  matchesPriority,
  setPackageQuantity,
} from "./parse"

const CATEGORY_PRIORITY = ["festival", "last forever fan", "cat 1"]
const BUY_COUNT = 1

const BUY_BUTTON_TEXT = /beli\s+tiket\s+sekarang/i

const findBuyButton = () => {
  for (const el of document.querySelectorAll("button")) {
    if (el instanceof HTMLButtonElement && !el.disabled && BUY_BUTTON_TEXT.test(elementText(el))) {
      return el
    }
  }
  return undefined
}

const getPagePhase = () => {
  const { pathname } = location
  if (pathname.endsWith("/order")) return "order"
  if (pathname.endsWith("/packages")) return "packages"
  if (pathname.includes("/to-do/")) return "overview"
  return undefined
}

const poll = <A>(name: string, find: () => A | undefined) =>
  Effect.sync(find).pipe(
    Effect.tap((value) =>
      value ? Effect.logInfo(`Found ${name}`) : Effect.logInfo(`${name} not found, retrying...`),
    ),
    Effect.repeat({
      until: (value): value is NonNullable<A> => value !== undefined,
      schedule: Schedule.spaced(Duration.millis(20)),
    }),
  )

const tryPriority = (priority: string) =>
  Effect.gen(function* () {
    const expanded = findExpandedPackage()
    if (expanded && matchesPriority(expanded.title, priority)) {
      if (!setPackageQuantity(BUY_COUNT)) {
        yield* Effect.logInfo(
          `Cannot set quantity ${BUY_COUNT} for "${expanded.title}", trying next priority`,
        )
        return false
      }

      const pesan = yield* poll("Pesan button", findPesanButton)
      pesan.click()
      yield* Effect.logInfo(`Ordered ${BUY_COUNT} from "${expanded.title}"`)
      return true
    }

    const match = findPilih(priority)
    if (!match) {
      yield* Effect.logInfo(`No available package for priority "${priority}"`)
      return false
    }

    match.button.click()
    yield* Effect.logInfo(`Clicked Pilih for "${match.title}"`)

    const pkg = yield* poll("expanded package", () => {
      const expanded = findExpandedPackage()
      if (!expanded || !matchesPriority(expanded.title, priority)) return undefined
      return expanded
    })

    if (!setPackageQuantity(BUY_COUNT)) {
      yield* Effect.logInfo(
        `Quantity ${BUY_COUNT} not available for "${pkg.title}", trying next priority`,
      )
      return false
    }

    const pesan = yield* poll("Pesan button", findPesanButton)
    pesan.click()
    yield* Effect.logInfo(`Ordered ${BUY_COUNT} from "${pkg.title}"`)
    return true
  })

const runOverview = Effect.gen(function* () {
  const button = yield* poll("buy button", findBuyButton)
  button.click()
  yield* Effect.logInfo('Clicked "Beli tiket sekarang"')
})

const runPackages = Effect.gen(function* () {
  for (const priority of CATEGORY_PRIORITY) {
    if (yield* tryPriority(priority)) return
  }

  yield* Effect.logInfo("Falling back to first available package")
  const match = findPilih()
  if (!match) {
    yield* Effect.logInfo("No available packages, waiting...")
    return
  }

  match.button.click()
  yield* Effect.logInfo(`Clicked Pilih for "${match.title}" (fallback)`)

  const pkg = yield* poll("expanded package", findExpandedPackage)

  if (!setPackageQuantity(BUY_COUNT)) {
    yield* Effect.logInfo(`Quantity ${BUY_COUNT} not available for "${pkg.title}" (fallback)`)
    return
  }

  const pesan = yield* poll("Pesan button", findPesanButton)
  pesan.click()
  yield* Effect.logInfo(`Ordered ${BUY_COUNT} from "${pkg.title}" (fallback)`)
})

const runStep = Effect.gen(function* () {
  const phase = getPagePhase()
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
    main.pipe(BrowserRuntime.runMain)
  },
})
