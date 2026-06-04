import { NoCustomer } from "@/lib/customer-store"
import { LocatorTimeout, NotInteractable, StrictModeViolation } from "@/lib/playwlite"
import { Data } from "effect"
import type { PageKind } from "./routing"

export class NoPackageAvailable extends Data.TaggedError("NoPackageAvailable")<{
  readonly reason: "no-inventory" | "no-matching-category"
}> {}

export class StepTimeout extends Data.TaggedError("StepTimeout")<{
  readonly step: PageKind
}> {}

export class PipelineStuck extends Data.TaggedError("PipelineStuck")<{
  readonly browserState: PageKind | "unknown"
  readonly completedThrough: string
}> {}

export class RateLimited extends Data.TaggedError("RateLimited")<{}> {}

export class MembershipCodeMissing extends Data.TaggedError("MembershipCodeMissing")<{}> {}

export class MembershipCodeRejected extends Data.TaggedError("MembershipCodeRejected")<{}> {}

export const autobuyFailureReason = (error: unknown): string => {
  if (error instanceof NoPackageAvailable) {
    return error.reason === "no-inventory" ? "no packages on page" : "no matching category"
  }
  if (error instanceof NoCustomer) return "no customer in storage"
  if (error instanceof MembershipCodeMissing) return "membership code not configured"
  if (error instanceof MembershipCodeRejected) return "membership code already used"
  if (error instanceof RateLimited) return "rate limited after retry"
  if (error instanceof PipelineStuck) {
    return `stuck on ${error.browserState} (completed through ${error.completedThrough})`
  }
  if (error instanceof StepTimeout) return `timed out waiting for ${error.step} page`
  if (error instanceof LocatorTimeout) return "element wait timed out"
  if (error instanceof StrictModeViolation) return "ambiguous selector match"
  if (error instanceof NotInteractable) return `element not interactable (${error.reason})`
  if (error instanceof Error) return error.message
  return String(error)
}
