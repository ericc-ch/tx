import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Duration, Effect, Layer, Path } from "effect"
import { pathToFileURL } from "node:url"
import { chromium } from "playwright"
import which from "which"

const main = Effect.gen(function* () {
  const path = yield* Path.Path
  const fixturePath = path.join(import.meta.dirname, "..", "fixtures", "the-weeknd-queue.html")

  const heliumPath = yield* Effect.promise(() => which("helium"))
  const browser = yield* Effect.promise(() =>
    chromium.launch({
      executablePath: heliumPath,
      headless: false,
      args: [
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
      ],
    }),
  )

  yield* Effect.gen(function* () {
    const context = yield* Effect.promise(() => browser.newContext())
    const page = yield* Effect.promise(() => context.newPage())

    yield* Effect.promise(() => page.bringToFront())
    yield* Effect.promise(() =>
      page.goto(
        "https://www.tiket.com/id-id/to-do/lany-soft-world-tour-in-jakarta-2026-29-oct-gos/packages",
      ),
    )
    yield* Effect.promise(() => page.bringToFront())

    yield* Effect.promise(() => page.mouse.move(100, 200))
    yield* Effect.promise(() => page.mouse.wheel(0, 500))
    yield* Effect.promise(() => page.mouse.move(150, 250))
  })

  const context = yield* Effect.promise(() => browser.newContext())
  const page = yield* Effect.promise(() => context.newPage())

  yield* Effect.promise(() => page.goto(pathToFileURL(fixturePath).toString()))

  yield* Effect.logInfo("Waiting for queue to start...")

  const pollResult = yield* Effect.promise(() =>
    page.waitForFunction(
      () => {
        const el = document.querySelector("#MainPart_lbUsersInLineAheadOfYou")
        const text = el?.textContent?.trim()
        return text && text !== "0" ? text : undefined
      },
      undefined,
      { polling: 1000 },
    ),
  )

  const peopleAheadText = yield* Effect.promise(() => pollResult.jsonValue())
  const parsed = Number(peopleAheadText?.toString().replace(/,/g, ""))

  yield* Effect.logInfo(`Queue started! People in front: ${parsed}`)

  yield* Effect.sleep(Duration.infinity)
})

const layers = Layer.empty.pipe(Layer.merge(NodeServices.layer))

NodeRuntime.runMain(Effect.provide(main, layers))
