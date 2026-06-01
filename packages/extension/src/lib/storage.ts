import { Effect, Option, Schema } from "effect"
import { storage } from "wxt/utils/storage"

const read = <S extends Schema.Top>(key: `local:${string}`, schema: S) =>
  Effect.gen(function* () {
    const value = yield* Effect.tryPromise(() => storage.getItem(key))
    const stored = Option.fromNullishOr(value)
    if (Option.isNone(stored)) return Option.none()

    return yield* Schema.decodeUnknownEffect(schema)(stored.value).pipe(
      Effect.map(Option.some),
      Effect.orDie,
    )
  })

const write = (key: `local:${string}`, value: unknown) =>
  Effect.tryPromise(() => storage.setItem(key, value)).pipe(Effect.orDie)

const remove = (key: `local:${string}`) =>
  Effect.tryPromise(() => storage.removeItem(key)).pipe(Effect.orDie)

export const makePersistedStore = <S extends Schema.Top>(config: {
  key: `local:${string}`
  schema: S
}) => {
  const { key, schema } = config

  return {
    get: Effect.fn(function* () {
      return yield* read(key, schema)
    }),
    set: Effect.fn(function* (value: Schema.Schema.Type<S>) {
      yield* write(key, value)
    }),
    remove: Effect.fn(function* () {
      yield* remove(key)
    }),
  }
}
