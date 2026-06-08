import type { Customer } from "@tx/schema"
import { Context, Effect, Layer } from "effect"

export class SessionMap extends Context.Service<SessionMap>()("@tx/cli/SessionMap", {
  make: Effect.sync(() => {
    const assigned = new Map<string, typeof Customer.Type>()

    return {
      get: (browserId: string) => assigned.get(browserId),
      set: (browserId: string, customer: typeof Customer.Type) => {
        assigned.set(browserId, customer)
      },
      remove: (browserId: string) => {
        assigned.delete(browserId)
      },
    }
  }),
}) {
  static layer = Layer.effect(this, this.make)
}
