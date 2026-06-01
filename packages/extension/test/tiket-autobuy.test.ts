import { beforeEach, describe, expect, it } from "@effect/vitest"
import { CustomerStore } from "@/lib/customer-store"
import { Effect, Layer, Option } from "effect"
import { runPackages } from "../src/entrypoints/tiket-autobuy.content/flow-packages"
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
        return yield* Effect.succeed(Option.some(customer))
      }),
      set: Effect.fn(function* () {}),
      remove: Effect.fn(function* () {}),
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

  it("submits order from package bottom sheet", async () => {
    await Effect.runPromise(
      loadFixture("../../../fixtures/lany-packages-en.html").pipe(Effect.provide(NodePlatform)),
    )
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
})
