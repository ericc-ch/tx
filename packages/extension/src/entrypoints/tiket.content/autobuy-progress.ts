import { makePersistedStore } from "@/lib/storage"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { checkoutSteps, type CheckoutCheckpoint } from "./checkout-sequence"
import type { PageKind } from "./routing"

type CompletedThrough = "none" | CheckoutCheckpoint

export const CompletedThroughSchema = Schema.Union([
  Schema.Literal("none"),
  Schema.Literal("packages"),
  Schema.Literal("order"),
  Schema.Literal("payment"),
  Schema.Literal("payment-confirm"),
])

export const AutobuyProgressState = Schema.Struct({
  customerEmail: Schema.String,
  completedThrough: CompletedThroughSchema,
})

const progressStore = makePersistedStore({
  key: "local:autobuy-progress",
  schema: AutobuyProgressState,
})

const completedForCustomer = (
  stored: Option.Option<typeof AutobuyProgressState.Type>,
  customerEmail: string,
) =>
  Option.match(stored, {
    onNone: () => "none" as const,
    onSome: (state) =>
      state.customerEmail === customerEmail ? state.completedThrough : ("none" as const),
  })

export class AutobuyProgress extends Context.Service<AutobuyProgress>()(
  "@tx/extension/AutobuyProgress",
  {
    make: Effect.sync(() => ({
      clear: progressStore.remove,
      markCompleted: Effect.fn(function* (customerEmail: string, step: CheckoutCheckpoint) {
        const previous = completedForCustomer(yield* progressStore.get(), customerEmail)
        const completedThrough = furthestCheckpoint(previous, step)
        yield* progressStore.set({ customerEmail, completedThrough })
        return completedThrough
      }),
      resolvedCompleted: Effect.fn(function* (customerEmail: string, page: PageKind) {
        const fromStore = completedForCustomer(yield* progressStore.get(), customerEmail)
        const index = checkoutSteps.findIndex((step) => step.page === page)
        const fromPage = index <= 0 ? ("none" as const) : checkoutSteps[index - 1]!.checkpoint
        return furthestCheckpoint(fromStore, fromPage)
      }),
    })),
  },
) {
  static layer = Layer.effect(this, this.make)
}

const furthestCheckpoint = (left: CompletedThrough, right: CompletedThrough) => {
  const rank = (checkpoint: CompletedThrough) => {
    if (checkpoint === "none") return -1
    return checkoutSteps.findIndex((step) => step.checkpoint === checkpoint)
  }
  return rank(left) >= rank(right) ? left : right
}
