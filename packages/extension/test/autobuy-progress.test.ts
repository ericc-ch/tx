import { describe, expect, it } from "@effect/vitest"
import {
  canRunPageStep,
  inferredCompleted,
  maxCompleted,
} from "../src/entrypoints/tiket-autobuy.content/autobuy-progress"

describe("autobuy progress", () => {
  it("merges completed checkpoints", () => {
    expect(maxCompleted("none", "packages")).toBe("packages")
    expect(maxCompleted("packages", "order")).toBe("order")
    expect(maxCompleted("order", "packages")).toBe("order")
  })

  it("infers progress from the current page", () => {
    expect(inferredCompleted("order")).toBe("packages")
    expect(inferredCompleted("payment")).toBe("order")
    expect(inferredCompleted("payment-confirm")).toBe("payment")
  })

  it("only runs a page step when the prior checkpoint is satisfied", () => {
    expect(canRunPageStep("none", "packages")).toBe(true)
    expect(canRunPageStep("packages", "packages")).toBe(false)
    expect(canRunPageStep("packages", "order")).toBe(true)
    expect(canRunPageStep("order", "payment")).toBe(true)
    expect(canRunPageStep("none", "order")).toBe(false)
  })
})
