import { beforeEach, describe, expect, it, vi } from "@effect/vitest"
import { CustomerStore } from "@/lib/customer"
import { Effect, Fiber, Layer, Option } from "effect"
import { NoPackageAvailable } from "../src/entrypoints/tiket-autobuy.content/errors"
import { runPackages } from "../src/entrypoints/tiket-autobuy.content/flow-packages"
import { resetToOverview, runOverview } from "../src/entrypoints/tiket-autobuy.content/flow-overview"
import { loadFixture, NodePlatform, resetDom } from "./util"

const defaultCustomer = {
  name: "Test User",
  email: "test@example.com",
  birthDate: "1/1/2000",
  gender: "Female",
  nik: "1234567890123456",
  phone: "081234567890",
  categories: ["cat 6", "last forever fan", "festival", "cat 1"],
  ticketCount: 6,
  day: "Day 1",
  membershipCode: "WDYSLM",
  paymentMethod: "BCA",
}

const customerStoreLayer = (customer = defaultCustomer) =>
  Layer.succeed(
    CustomerStore,
    CustomerStore.of({
      get: Effect.fn(function* () {
        return yield* Effect.succeed(customer)
      }),
      getOption: Effect.fn(function* () {
        return yield* Effect.succeed(Option.some(customer))
      }),
      set: Effect.fn(function* () {}),
      clear: Effect.fn(function* () {}),
    }),
  )

const runPackagesWithCustomer = (customer = defaultCustomer) =>
  runPackages.pipe(Effect.provide(customerStoreLayer(customer)))

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

describe("tiket autobuy", () => {
  beforeEach(resetDom)

  it("resets packages to overview preserving locale and query", async () => {
    const locationState = {
      pathname:
        "/id-id/to-do/lany-soft-world-tour-in-jakarta-2026-29-oct-gos/packages",
      search: "?utm_page=toDoDetail",
    }
    const assign = vi.fn((url: string) => {
      const parsed = new URL(url, "https://www.tiket.com")
      locationState.pathname = parsed.pathname
    })
    Object.defineProperty(window, "location", {
      configurable: true,
      get: () => ({
        ...locationState,
        assign,
      }),
    })

    await Effect.runPromise(resetToOverview)

    expect(assign).toHaveBeenCalledWith(
      "/id-id/to-do/lany-soft-world-tour-in-jakarta-2026-29-oct-gos?utm_page=toDoDetail",
    )
  })

  it("navigates overview to packages preserving locale and query", async () => {
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

  it.each([
    ["../../../fixtures/lany-packages-en.html"],
    ["../../../fixtures/lany-packages-id.html"],
  ])("submits order from bottom sheet (%s)", async (fixturePath) => {
    await Effect.runPromise(loadFixture(fixturePath).pipe(Effect.provide(NodePlatform)))
    makeVisible()

    const input = document.querySelector('[data-testid="bottom-sheet-body"] input[type="number"]')
    if (!(input instanceof HTMLInputElement)) throw new Error("missing qty input")
    input.value = "6"
    input.removeAttribute("disabled")

    expect(await Effect.runPromise(runPackagesWithCustomer())).toBe("submitted")
  })

  it("submits order from post-verify presale sheet", async () => {
    await Effect.runPromise(
      loadFixture("../../../fixtures/whitelist-packages-ready-en.html").pipe(
        Effect.provide(NodePlatform),
      ),
    )
    makeVisible()

    const input = document.querySelector('[data-testid="bottom-sheet-body"] input[type="number"]')
    if (!(input instanceof HTMLInputElement)) throw new Error("missing qty input")
    input.value = "6"
    input.removeAttribute("disabled")

    expect(await Effect.runPromise(runPackagesWithCustomer())).toBe("submitted")
  })

  it("fills presale code when verify step is shown", async () => {
    await Effect.runPromise(
      loadFixture("../../../fixtures/whitelist-packages-verify-en.html").pipe(
        Effect.provide(NodePlatform),
      ),
    )
    makeVisible()

    const codeInput = document.querySelector('[data-testid="bottom-sheet-body"] input[type="text"]')
    if (!(codeInput instanceof HTMLInputElement)) throw new Error("missing code input")

    const fiber = await Effect.runFork(runPackagesWithCustomer())
    await Effect.runPromise(Effect.sleep("500 millis"))
    expect(codeInput.value).toBe("WDYSLM")
    await Effect.runPromise(Fiber.interrupt(fiber))
  })

  it("skips presale package when membership code is missing", async () => {
    await Effect.runPromise(
      loadFixture("../../../fixtures/whitelist-packages-verify-en.html").pipe(
        Effect.provide(NodePlatform),
      ),
    )
    makeVisible()

    const error = await Effect.runPromise(
      runPackagesWithCustomer({ ...defaultCustomer, membershipCode: "" }).pipe(Effect.flip),
    )
    expect(error).toBeInstanceOf(NoPackageAvailable)
  })
})
