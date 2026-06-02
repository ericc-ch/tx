import { Effect } from "effect"

export const runPaymentConfirm = Effect.gen(function* () {
  yield* Effect.logDebug("Payment confirm page — not implemented")
  return "done" as const
})
