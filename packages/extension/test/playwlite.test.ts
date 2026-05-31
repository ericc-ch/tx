import { describe, expect, it } from "@effect/vitest"
import { LocatorTimeout, NotInteractable, Page, StrictModeViolation } from "@/lib/playwlite"
import { Duration, Effect, Fiber } from "effect"
import { resetDom } from "./util"

describe("playwlite", () => {
  it.live("inputValue waits for element to appear", () =>
    Effect.scoped(
      Effect.gen(function* () {
        resetDom()
        const root = document.createElement("div")
        document.body.appendChild(root)
        const page = new Page(root)

        const setup = yield* Effect.forkScoped(
          Effect.gen(function* () {
            yield* Effect.sleep("50 millis")
            const input = document.createElement("input")
            input.type = "number"
            input.value = "42"
            root.appendChild(input)
          }),
        )

        const value = yield* page.locator("input").inputValue({ timeout: "1 second" })
        yield* Fiber.await(setup)
        expect(value).toBe("42")
      }),
    ),
  )

  it.live("inputValue times out with the configured duration", () =>
    Effect.gen(function* () {
      resetDom()
      const root = document.createElement("div")
      document.body.appendChild(root)
      const page = new Page(root)

      const error = (yield* page
        .locator("input")
        .inputValue({ timeout: "100 millis" })
        .pipe(Effect.flip)) as LocatorTimeout
      expect(error._tag).toBe("LocatorTimeout")
      expect(Duration.toMillis(error.timeout)).toBe(100)
      expect(error.state).toBe("attached")
    }),
  )

  it.live("inputValue fails immediately on wrong element type", () =>
    Effect.gen(function* () {
      resetDom()
      const root = document.createElement("div")
      root.innerHTML = "<div>not an input</div>"
      document.body.appendChild(root)
      const page = new Page(root)

      const started = Date.now()
      const error = (yield* page
        .locator("div")
        .inputValue({ timeout: "1 second" })
        .pipe(Effect.flip)) as NotInteractable
      expect(error._tag).toBe("NotInteractable")
      expect(error.reason).toBe("wrong-element")
      expect(Date.now() - started).toBeLessThan(100)
    }),
  )

  it.live("strict mode fails immediately when multiple elements match", () =>
    Effect.gen(function* () {
      resetDom()
      const root = document.createElement("div")
      root.innerHTML = "<input /><input />"
      document.body.appendChild(root)
      const page = new Page(root)

      const error = (yield* page
        .locator("input")
        .inputValue({ timeout: "1 second" })
        .pipe(Effect.flip)) as StrictModeViolation
      expect(error._tag).toBe("StrictModeViolation")
      expect(error.count).toBe(2)
    }),
  )

  it.live("isVisible returns immediately when element is missing", () =>
    Effect.gen(function* () {
      resetDom()
      const root = document.createElement("div")
      document.body.appendChild(root)
      const page = new Page(root)

      const started = Date.now()
      const visible = yield* page.locator("button").isVisible()
      expect(visible).toBe(false)
      expect(Date.now() - started).toBeLessThan(100)
    }),
  )

  it.live("isEnabled waits for element before reading state", () =>
    Effect.scoped(
      Effect.gen(function* () {
        resetDom()
        const root = document.createElement("div")
        document.body.appendChild(root)
        const page = new Page(root)

        const setup = yield* Effect.forkScoped(
          Effect.gen(function* () {
            yield* Effect.sleep("50 millis")
            const button = document.createElement("button")
            button.textContent = "Buy"
            root.appendChild(button)
          }),
        )

        const enabled = yield* page.locator("button").isEnabled({ timeout: "1 second" })
        yield* Fiber.await(setup)
        expect(enabled).toBe(true)
      }),
    ),
  )

  it.live("waitFor attached retries until element appears", () =>
    Effect.scoped(
      Effect.gen(function* () {
        resetDom()
        const root = document.createElement("div")
        document.body.appendChild(root)
        const page = new Page(root)

        const setup = yield* Effect.forkScoped(
          Effect.gen(function* () {
            yield* Effect.sleep("50 millis")
            const panel = document.createElement("div")
            panel.textContent = "sheet"
            root.appendChild(panel)
          }),
        )

        yield* page.locator("div").waitFor({ state: "attached", timeout: "1 second" })
        yield* Fiber.await(setup)
      }),
    ),
  )

  it.live("dispatchEvent waits for element", () =>
    Effect.scoped(
      Effect.gen(function* () {
        resetDom()
        const root = document.createElement("div")
        document.body.appendChild(root)
        const page = new Page(root)
        let called = false

        const setup = yield* Effect.forkScoped(
          Effect.gen(function* () {
            yield* Effect.sleep("50 millis")
            const target = document.createElement("div")
            target.addEventListener("custom", () => {
              called = true
            })
            root.appendChild(target)
          }),
        )

        yield* page.locator("div").dispatchEvent("custom", {}, { timeout: "1 second" })
        yield* Fiber.await(setup)
        expect(called).toBe(true)
      }),
    ),
  )
})
