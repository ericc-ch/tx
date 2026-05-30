import { Effect, Option, Schema } from "effect"
import { storage } from "wxt/utils/storage"

export const readItem = <S extends Schema.Top>(
  key: `local:${string}`,
  schema: S,
  missingMessage: string,
) =>
  Effect.gen(function* () {
    const value = yield* Effect.tryPromise(() => storage.getItem(key))
    const stored = Option.fromNullishOr(value)
    if (Option.isNone(stored)) {
      return yield* Effect.die(new Error(missingMessage))
    }

    return yield* Schema.decodeUnknownEffect(schema)(stored.value).pipe(Effect.orDie)
  })

export const readItemOption = <S extends Schema.Top>(key: `local:${string}`, schema: S) =>
  Effect.gen(function* () {
    const value = yield* Effect.tryPromise(() => storage.getItem(key))
    const stored = Option.fromNullishOr(value)
    if (Option.isNone(stored)) return Option.none()

    return yield* Schema.decodeUnknownEffect(schema)(stored.value).pipe(
      Effect.map(Option.some),
      Effect.orDie,
    )
  })

export const writeItem = (key: `local:${string}`, value: unknown) =>
  Effect.tryPromise(() => storage.setItem(key, value)).pipe(Effect.orDie)

export const removeItem = (key: `local:${string}`) =>
  Effect.tryPromise(() => storage.removeItem(key)).pipe(Effect.orDie)
