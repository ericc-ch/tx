import { beforeEach, describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { vi } from "vitest"
import { AutobuyProgress } from "../src/entrypoints/tiket.content/autobuy-progress"
import { checkoutSteps, finalCheckpoint } from "../src/entrypoints/tiket.content/checkout-sequence"

const { storageData } = vi.hoisted(() => ({
  storageData: new Map<string, unknown>(),
}))

vi.mock("wxt/utils/storage", () => ({
  storage: {
    getItem: (key: string) => Promise.resolve(storageData.get(key) ?? null),
    setItem: (key: string, value: unknown) => {
      storageData.set(key, value)
      return Promise.resolve()
    },
    removeItem: (key: string) => {
      storageData.delete(key)
      return Promise.resolve()
    },
  },
}))

const email = "test@example.com"
const runProgress = <A, E>(effect: Effect.Effect<A, E, AutobuyProgress>) =>
  effect.pipe(Effect.provide(AutobuyProgress.layer), Effect.runPromise)

describe("autobuy steps", () => {
  it("chains each waitFor to the next checkout page", () => {
    for (let index = 0; index < checkoutSteps.length - 1; index++) {
      const step = checkoutSteps[index]!
      const next = checkoutSteps[index + 1]!
      expect("waitFor" in step && step.waitFor).toBe(next.page)
    }
  })
})

describe("AutobuyProgress", () => {
  beforeEach(() => {
    storageData.clear()
  })

  it("infers prior checkpoints from the current page", () =>
    runProgress(
      Effect.gen(function* () {
        const progress = yield* AutobuyProgress
        expect(yield* progress.resolvedCompleted(email, "packages")).toBe("none")
        expect(yield* progress.resolvedCompleted(email, "order")).toBe("packages")
        expect(yield* progress.resolvedCompleted(email, "payment")).toBe("order")
        expect(yield* progress.resolvedCompleted(email, "payment-confirm")).toBe("payment")
      }),
    ))

  it("merges stored progress with page inference", () =>
    runProgress(
      Effect.gen(function* () {
        const progress = yield* AutobuyProgress
        yield* progress.markCompleted(email, "packages")
        expect(yield* progress.resolvedCompleted(email, "payment")).toBe("order")
      }),
    ))

  it("ignores stored progress for a different customer", () =>
    runProgress(
      Effect.gen(function* () {
        const progress = yield* AutobuyProgress
        yield* progress.markCompleted("other@example.com", "payment")
        expect(yield* progress.resolvedCompleted(email, "payment")).toBe("order")
      }),
    ))

  it("keeps the furthest checkpoint when marking out of order", () =>
    runProgress(
      Effect.gen(function* () {
        const progress = yield* AutobuyProgress
        expect(yield* progress.markCompleted(email, "payment")).toBe("payment")
        expect(yield* progress.markCompleted(email, "order")).toBe("payment")
        expect(yield* progress.markCompleted(email, finalCheckpoint)).toBe(finalCheckpoint)
      }),
    ))
})
