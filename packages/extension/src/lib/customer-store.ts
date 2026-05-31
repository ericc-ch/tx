import { Customer } from "@tx/server/schema"
import { Context, Effect, Layer } from "effect"
import { readItem, readItemOption, removeItem, writeItem } from "./storage"

const CUSTOMER_STORAGE_KEY = "local:customer"

export class CustomerStore extends Context.Service<CustomerStore>()("@tx/extension/CustomerStore", {
  make: Effect.sync(() => {
    return {
      get: Effect.fn(function* () {
        return yield* readItem(CUSTOMER_STORAGE_KEY, Customer, "No customer in storage")
      }),
      getOption: Effect.fn(function* () {
        return yield* readItemOption(CUSTOMER_STORAGE_KEY, Customer)
      }),
      set: Effect.fn(function* (customer: typeof Customer.Type) {
        yield* writeItem(CUSTOMER_STORAGE_KEY, customer)
      }),
      clear: Effect.fn(function* () {
        yield* removeItem(CUSTOMER_STORAGE_KEY)
      }),
    }
  }),
}) {
  static layer = Layer.effect(this, this.make)
}
