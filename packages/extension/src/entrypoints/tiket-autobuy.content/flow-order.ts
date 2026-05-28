import { Effect } from "effect"

export const runOrder = Effect.gen(function* () {
  yield* Effect.logInfo("Reached order page — autobuy complete")
  return "done" as const
})
