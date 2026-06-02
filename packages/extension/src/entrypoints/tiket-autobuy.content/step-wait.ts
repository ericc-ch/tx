import { Context, Effect, Layer, Schedule } from "effect"
import { StepTimeout } from "./errors"
import * as RateLimitDialog from "./rate-limit-dialog"
import { type PageKind, pageKind } from "./routing"

const pollSchedule = Schedule.spaced("50 millis").pipe(Schedule.both(Schedule.during("90 seconds")))

const waitForNextPageImpl = Effect.fn(function* (expectedNext: PageKind) {
  yield* Effect.gen(function* () {
    if (yield* RateLimitDialog.handleIfPresent) return "pending" as const
    if (pageKind(location) === expectedNext) return "completed" as const
    return "pending" as const
  }).pipe(
    Effect.repeat({
      until: (status) => status === "completed",
      schedule: pollSchedule,
    }),
    Effect.catch(() => new StepTimeout({ step: expectedNext })),
  )
})

export class StepWait extends Context.Service<StepWait>()("@tx/extension/StepWait", {
  make: Effect.sync(() => ({
    waitForNextPage: waitForNextPageImpl,
  })),
}) {
  static layer = Layer.effect(this, this.make)

  static testLayer = Layer.succeed(
    this,
    StepWait.of({
      waitForNextPage: Effect.fn(function* () {}),
    }),
  )
}

export const waitForNextPage = (expectedNext: PageKind) =>
  Effect.gen(function* () {
    const stepWait = yield* StepWait
    yield* stepWait.waitForNextPage(expectedNext)
  })
