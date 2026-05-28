import { beforeEach, describe, expect, it, vi } from "@effect/vitest"
import { Effect } from "effect"
import {
  ORDER_BUTTON_TEXT,
  SELECT_BUTTON_TEXT,
  SOLD_OUT_TEXT,
} from "../src/entrypoints/tiket-autobuy.content/flow-packages"
import { runOverview } from "../src/entrypoints/tiket-autobuy.content/flow-overview"
import { Page } from "../src/lib/playwlite"
import { loadFixture, NodePlatform, resetDom } from "./util"

const makeVisible = () => {
  for (const element of document.querySelectorAll("*")) {
    Object.defineProperty(element, "getBoundingClientRect", {
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

const countAvailablePackages = () =>
  Effect.gen(function* () {
    const page = new Page(document)
    const cards = page.getByTestId("package-card").filter({ visible: true })
    const count = yield* cards.count()
    let available = 0

    for (let index = 0; index < count; index++) {
      const card = cards.nth(index)
      const footer = card.getByTestId("package-card-footer")
      if ((yield* footer.getByText(SOLD_OUT_TEXT).count()) > 0) continue
      if (
        (yield* footer
          .getByRole("button", { name: SELECT_BUTTON_TEXT, disabled: false })
          .count()) === 0
      )
        continue
      available++
    }

    return available
  })

describe("runOverview", () => {
  beforeEach(resetDom)

  it("navigates to packages preserving locale path and query", async () => {
    const assign = vi.fn()
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        pathname: "/id-id/to-do/lany-soft-world-tour-in-jakarta-2026-29-oct-gos",
        search: "?utm_page=toDoDetail",
        assign,
      },
    })

    await Effect.runPromise(runOverview)

    expect(assign).toHaveBeenCalledWith(
      "/id-id/to-do/lany-soft-world-tour-in-jakarta-2026-29-oct-gos/packages?utm_page=toDoDetail",
    )
  })

  it("does not navigate when already on packages", async () => {
    const assign = vi.fn()
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        pathname: "/en-id/to-do/some-event/packages",
        search: "",
        assign,
      },
    })

    await Effect.runPromise(runOverview)

    expect(assign).not.toHaveBeenCalled()
  })
})

describe("package locale matchers", () => {
  beforeEach(resetDom)

  it.each([
    ["../../../fixtures/lany-packages-en.html", "en"],
    ["../../../fixtures/lany-packages-id.html", "id"],
  ])("finds available packages in %s fixture", async (fixturePath) => {
    await Effect.runPromise(
      loadFixture(fixturePath).pipe(Effect.provide(NodePlatform)),
    )
    makeVisible()

    expect(await Effect.runPromise(countAvailablePackages())).toBe(4)
  })

  it("matches order button labels in both locales", () => {
    expect(ORDER_BUTTON_TEXT.test("Pesan")).toBe(true)
    expect(ORDER_BUTTON_TEXT.test("Book")).toBe(true)
  })
})
