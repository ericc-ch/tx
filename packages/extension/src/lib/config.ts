import { INIT_PAYLOAD_PARAM, InitPayload, InitPayloadFromUrlParam } from "@tx/server/schema"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { browser } from "wxt/browser"
import { storage } from "wxt/utils/storage"

const CONFIG_STORAGE_KEY = "local:config"

export class Config extends Context.Service<Config>()("tx/Config", {
  make: Effect.sync(() => {
    return {
      get: Effect.fn(function* () {
        const value = yield* Effect.tryPromise(() => storage.getItem(CONFIG_STORAGE_KEY))
        const stored = Option.fromNullishOr(value)
        if (Option.isNone(stored)) {
          return yield* Effect.die(new Error("Extension config not loaded"))
        }

        return yield* Schema.decodeUnknownEffect(InitPayload)(stored.value).pipe(Effect.orDie)
      }),
      set: Effect.fn(function* (payload: typeof InitPayload.Type) {
        yield* Effect.tryPromise(() => storage.setItem(CONFIG_STORAGE_KEY, payload)).pipe(
          Effect.orDie,
        )
      }),
    }
  }),
}) {
  static layer = Layer.effect(this, this.make)
}

export const registerConfigCapture = Effect.gen(function* () {
  const config = yield* Config
  const context = yield* Effect.context()

  yield* Effect.sync(() => {
    browser.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
      const url = changeInfo.url ?? tab.url
      if (!url) return

      Effect.gen(function* () {
        const encoded = Option.fromNullishOr(new URL(url).searchParams.get(INIT_PAYLOAD_PARAM))
        if (Option.isNone(encoded)) return

        const payload = yield* Schema.decodeUnknownEffect(InitPayloadFromUrlParam)(
          encoded.value,
        ).pipe(Effect.orDie)

        yield* config.set(payload)
        yield* Effect.logInfo("Captured and persisted config:", payload)
      }).pipe(Effect.runForkWith(context))
    })
  })
})
