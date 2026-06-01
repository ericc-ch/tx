import { Data } from "effect"

export class NoPackageAvailable extends Data.TaggedError("NoPackageAvailable")<{
  readonly reason: "no-inventory" | "no-matching-category"
}> {}

export const autobuyFailureReason = (error: unknown): string => {
  if (typeof error !== "object" || error === null || !("_tag" in error)) {
    return String(error)
  }

  if (error._tag === "NoPackageAvailable" && "reason" in error) {
    return error.reason === "no-inventory" ? "no packages on page" : "no matching category"
  }

  if (error._tag === "LocatorTimeout") return "element wait timed out"
  if (error._tag === "StrictModeViolation") return "ambiguous selector match"
  if (error._tag === "NotInteractable" && "reason" in error) {
    return `element not interactable (${error.reason})`
  }

  return String(error._tag)
}
