export const autobuySteps = [
  { kind: "navigation", page: "overview" },
  { kind: "checkout", page: "packages", waitFor: "order", checkpoint: "packages" },
  { kind: "checkout", page: "order", waitFor: "payment", checkpoint: "order" },
  { kind: "checkout", page: "payment", waitFor: "payment-confirm", checkpoint: "payment" },
  { kind: "checkout", page: "payment-confirm", checkpoint: "payment-confirm" },
] as const

type AutobuyStep = (typeof autobuySteps)[number]

export type AutobuyPage = AutobuyStep["page"]
export type CheckoutCheckpoint = Extract<AutobuyStep, { kind: "checkout" }>["checkpoint"]

export const checkoutSteps = autobuySteps.filter(
  (step): step is Extract<AutobuyStep, { kind: "checkout" }> => step.kind === "checkout",
)

export const finalCheckpoint = checkoutSteps.at(-1)!.checkpoint
