import { InitPayload } from "@tx/server/schema"
import { Effect, Option, Schema } from "effect"
import { storage } from "wxt/utils/storage"

const CONFIG_STORAGE_KEY = "local:config"

export const readConfig = () =>
  Effect.tryPromise(() => storage.getItem(CONFIG_STORAGE_KEY)).pipe(
    Effect.flatMap((value) =>
      value === null || value === undefined
        ? Effect.succeed(Option.none())
        : Schema.decodeUnknownEffect(InitPayload)(value).pipe(
            Effect.map(Option.some),
            Effect.orDie,
          ),
    ),
  )

export const requireConfig = () =>
  readConfig().pipe(
    Effect.flatMap((config) =>
      Option.isNone(config)
        ? Effect.die(new Error("Extension config not loaded"))
        : Effect.succeed(config.value),
    ),
  )

export const getBrowserId = () => requireConfig().pipe(Effect.map((config) => config.browserId))

export const getPort = () => requireConfig().pipe(Effect.map((config) => config.port))

export const persistConfig = (config: typeof InitPayload.Type) =>
  Effect.tryPromise(() => storage.setItem(CONFIG_STORAGE_KEY, config)).pipe(Effect.orDie)
