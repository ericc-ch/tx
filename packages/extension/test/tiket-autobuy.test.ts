import { beforeEach, describe, expect, it, vi } from "@effect/vitest"
import { Effect } from "effect"
import { runOverview } from "../src/entrypoints/tiket-autobuy.content/flow-overview"
import { resetDom } from "./util"

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
