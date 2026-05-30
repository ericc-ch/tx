import { Data } from "effect"

export class NoPackageAvailable extends Data.TaggedError("NoPackageAvailable") {}
