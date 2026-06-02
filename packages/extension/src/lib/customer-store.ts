import { Customer } from "@tx/server/schema"
import { Context, Data, Effect, Layer, Option } from "effect"
import { makePersistedStore } from "./storage"

export class NoCustomer extends Data.TaggedError("NoCustomer")<{}> {}

const customerStore = makePersistedStore({ key: "local:customer", schema: Customer })

export class CustomerStore extends Context.Service<CustomerStore>()("@tx/extension/CustomerStore", {
  make: Effect.sync(() => ({
    get: customerStore.get,
    set: customerStore.set,
    remove: customerStore.remove,
    require: Effect.fn(function* () {
      const customer = yield* customerStore.get()
      if (Option.isNone(customer)) {
        return yield* new NoCustomer()
      }
      return customer.value
    }),
  })),
}) {
  static layer = Layer.effect(this, this.make)

  static testLayer = (customer: typeof Customer.Type) =>
    Layer.succeed(
      this,
      CustomerStore.of({
        get: Effect.fn(function* () {
          return yield* Effect.succeed(Option.some(customer))
        }),
        set: Effect.fn(function* () {}),
        remove: Effect.fn(function* () {}),
        require: Effect.fn(function* () {
          return yield* Effect.succeed(customer)
        }),
      }),
    )
}
