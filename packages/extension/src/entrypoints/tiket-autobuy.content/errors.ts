import { Data } from "effect"
import type { PageKind } from "./routing"

export class NoPackageAvailable extends Data.TaggedError("NoPackageAvailable")<{
  readonly reason: "no-inventory" | "no-matching-category"
}> {}

export class StepTimeout extends Data.TaggedError("StepTimeout")<{
  readonly step: PageKind
}> {}

export const autobuyFailureReason = (error: unknown): string => {
  if (typeof error !== "object" || error === null || !("_tag" in error)) {
    return String(error)
  }

  if (error._tag === "NoPackageAvailable" && "reason" in error) {
    return error.reason === "no-inventory" ? "no packages on page" : "no matching category"
  }

  if (error._tag === "NoCustomer") return "no customer in storage"

  if (error._tag === "StepTimeout" && "step" in error) {
    return `timed out waiting for ${error.step} page`
  }

  if (error._tag === "LocatorTimeout") return "element wait timed out"
  if (error._tag === "StrictModeViolation") return "ambiguous selector match"
  if (error._tag === "NotInteractable" && "reason" in error) {
    return `element not interactable (${error.reason})`
  }

  return String(error._tag)
}
