import { beforeEach, describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { findOverviewBuyButton } from "../src/entrypoints/tiket-autobuy.content/overview"
import { Page } from "../src/lib/playwlite"
import { loadFixture, NodePlatform, resetDom } from "./util"

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

describe("findOverviewBuyButton", () => {
  beforeEach(resetDom)

  it("returns undefined when the buy button is missing", async () => {
    expect(await Effect.runPromise(findOverviewBuyButton(new Page(document)))).toBeUndefined()
  })

  it("finds buy button on Indonesian overview fixture", async () => {
    const button = await Effect.runPromise(
      Effect.gen(function* () {
        yield* loadFixture("../../../fixtures/lany-overview.html")
        makeButtonsVisible()
        return yield* findOverviewBuyButton(new Page(document))
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
        return yield* findOverviewBuyButton(new Page(document))
      }).pipe(Effect.provide(NodePlatform)),
    )

    expect(button).toBeDefined()
    expect((await Effect.runPromise(button!.textContent()))?.trim()).toBe("Buy ticket now")
  })
})
