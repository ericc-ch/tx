import { Customer } from "@tx/server/schema"
import { Context, Effect, Layer } from "effect"
import { makePersistedStore } from "./storage"

const customerStore = makePersistedStore({ key: "local:customer", schema: Customer })

export class CustomerStore extends Context.Service<CustomerStore>()("@tx/extension/CustomerStore", {
  make: Effect.sync(() => ({
    get: customerStore.get,
    set: customerStore.set,
    remove: customerStore.remove,
  })),
}) {
  static layer = Layer.effect(this, this.make)
}
