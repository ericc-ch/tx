import { Customer } from "@tx/server/schema"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { storage } from "wxt/utils/storage"

const CUSTOMER_STORAGE_KEY = "local:customer"

export class CustomerStore extends Context.Service<CustomerStore>()("tx/CustomerStore", {
  make: Effect.sync(() => {
    return {
      get: Effect.fn(function* () {
        const value = yield* Effect.tryPromise(() => storage.getItem(CUSTOMER_STORAGE_KEY))
        const stored = Option.fromNullishOr(value)
        if (Option.isNone(stored)) {
          return yield* Effect.die(new Error("No customer in storage"))
        }

        return yield* Schema.decodeUnknownEffect(Customer)(stored.value).pipe(Effect.orDie)
      }),
      getOption: Effect.fn(function* () {
        const value = yield* Effect.tryPromise(() => storage.getItem(CUSTOMER_STORAGE_KEY))
        const stored = Option.fromNullishOr(value)
        if (Option.isNone(stored)) return Option.none()

        return yield* Schema.decodeUnknownEffect(Customer)(stored.value).pipe(
          Effect.map(Option.some),
          Effect.orDie,
        )
      }),
      set: Effect.fn(function* (customer: typeof Customer.Type) {
        yield* Effect.tryPromise(() => storage.setItem(CUSTOMER_STORAGE_KEY, customer)).pipe(
          Effect.orDie,
        )
      }),
      clear: Effect.fn(function* () {
        yield* Effect.tryPromise(() => storage.removeItem(CUSTOMER_STORAGE_KEY)).pipe(Effect.orDie)
      }),
    }
  }),
}) {
  static layer = Layer.effect(this, this.make)
}
