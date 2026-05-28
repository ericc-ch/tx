import { beforeEach, describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { Page } from "../src/lib/playwlite"
import { loadFixture, NodePlatform, resetDom } from "./util"

const BUY_BUTTON_TEXT = /(?:beli\s+tiket\s+sekarang|buy\s+ticket\s+now)/i

const makeButtonsVisible = () => {
  for (const button of document.querySelectorAll("button")) {
    Object.defineProperty(button, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 10,
        bottom: 10,
        width: 10,
        height: 10,
        toJSON: () => ({}),
      }),
    })
  }
}

describe("overview buy button", () => {
  beforeEach(resetDom)

  it("returns undefined when the buy button is missing", async () => {
    const button = await Effect.runPromise(
      Effect.gen(function* () {
        const page = new Page(document)
        const locator = page.getByRole("button", { name: BUY_BUTTON_TEXT, disabled: false })
        return (yield* locator.count()) > 0 ? locator.first() : undefined
      }),
    )
    expect(button).toBeUndefined()
  })

  it("finds buy button on Indonesian overview fixture", async () => {
    const button = await Effect.runPromise(
      Effect.gen(function* () {
        yield* loadFixture("../../../fixtures/lany-overview.html")
        makeButtonsVisible()
        const page = new Page(document)
        const locator = page.getByRole("button", { name: BUY_BUTTON_TEXT, disabled: false })
        return (yield* locator.count()) > 0 ? locator.first() : undefined
      }).pipe(Effect.provide(NodePlatform)),
    )

    expect(button).toBeDefined()
    expect((await Effect.runPromise(button!.textContent()))?.trim()).toBe("Beli tiket sekarang")
  })

  it("finds buy button on English overview fixture", async () => {
    const button = await Effect.runPromise(
      Effect.gen(function* () {
        yield* loadFixture("../../../fixtures/lany-overview-en.html")
        makeButtonsVisible()
        const page = new Page(document)
        const locator = page.getByRole("button", { name: BUY_BUTTON_TEXT, disabled: false })
        return (yield* locator.count()) > 0 ? locator.first() : undefined
      }).pipe(Effect.provide(NodePlatform)),
    )

    expect(button).toBeDefined()
    expect((await Effect.runPromise(button!.textContent()))?.trim()).toBe("Buy ticket now")
  })
})
