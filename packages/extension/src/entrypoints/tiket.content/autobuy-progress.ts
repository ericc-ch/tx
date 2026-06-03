import { makePersistedStore } from "@/lib/storage"
import { Context, Effect, Layer, Option, Schema } from "effect"
import type { PageKind } from "./routing"

export const CompletedThrough = Schema.Union([
  Schema.Literal("none"),
  Schema.Literal("packages"),
  Schema.Literal("order"),
  Schema.Literal("payment"),
  Schema.Literal("confirm"),
])
export type CompletedThrough = typeof CompletedThrough.Type

export type CheckoutStep = Exclude<CompletedThrough, "none">

export const AutobuyProgressState = Schema.Struct({
  customerEmail: Schema.String,
  completedThrough: CompletedThrough,
})

const rank: Record<CompletedThrough, number> = {
  none: 0,
  packages: 1,
  order: 2,
  payment: 3,
  confirm: 4,
}

export const maxCompleted = (left: CompletedThrough, right: CompletedThrough) =>
  rank[left] >= rank[right] ? left : right

export const inferredCompleted = (page: PageKind): CompletedThrough => {
  switch (page) {
    case "payment-confirm":
      return "payment"
    case "payment":
      return "order"
    case "order":
      return "packages"
    default:
      return "none"
  }
}

const progressStore = makePersistedStore({
  key: "local:autobuy-progress",
  schema: AutobuyProgressState,
})

const stepForPage = (page: PageKind) => {
  switch (page) {
    case "packages":
      return "packages" as const
    case "order":
      return "order" as const
    case "payment":
      return "payment" as const
    case "payment-confirm":
      return "confirm" as const
    default:
      return null
  }
}

const prerequisite: Record<CheckoutStep, CompletedThrough> = {
  packages: "none",
  order: "packages",
  payment: "order",
  confirm: "payment",
}

export const canRunPageStep = (completed: CompletedThrough, page: PageKind) => {
  const step = stepForPage(page)
  if (!step) return false
  return completed === prerequisite[step]
}

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
      markCompleted: Effect.fn(function* (customerEmail: string, step: CheckoutStep) {
        const previous = completedForCustomer(yield* progressStore.get(), customerEmail)
        const completedThrough = maxCompleted(previous, step)
        yield* progressStore.set({ customerEmail, completedThrough })
        return completedThrough
      }),
      resolvedCompleted: Effect.fn(function* (customerEmail: string, page: PageKind) {
        const fromStore = completedForCustomer(yield* progressStore.get(), customerEmail)
        return maxCompleted(fromStore, inferredCompleted(page))
      }),
    })),
  },
) {
  static layer = Layer.effect(this, this.make)
}
