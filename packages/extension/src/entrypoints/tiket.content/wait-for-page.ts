import { Duration, Effect, Schedule } from "effect"
import { StepTimeout } from "./errors"
import * as RateLimitDialog from "./rate-limit-dialog"
import { type PageKind, pageKind } from "./routing"

const pollSchedule = Schedule.spaced(Duration.millis(100)).pipe(
  Schedule.both(Schedule.during(Duration.seconds(10))),
)

export const waitForPageKind = (expected: PageKind) =>
  Effect.gen(function* () {
    if (yield* RateLimitDialog.handleIfPresent) return "pending" as const
    if (pageKind(location) === expected) return "completed" as const
    return "pending" as const
  }).pipe(
    Effect.repeat({
      until: (status) => status === "completed",
      schedule: pollSchedule,
    }),
    Effect.catch(() => new StepTimeout({ step: expected })),
  )
