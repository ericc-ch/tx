import { INIT_PAYLOAD_PARAM, InitPayload, InitPayloadFromUrlParam } from "@tx/server/schema"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { browser } from "wxt/browser"
import { readItem, writeItem } from "./storage"

const CONFIG_STORAGE_KEY = "local:config"

export class Config extends Context.Service<Config>()("tx/Config", {
  make: Effect.sync(() => {
    return {
      get: Effect.fn(function* () {
        return yield* readItem(CONFIG_STORAGE_KEY, InitPayload, "Extension config not loaded")
      }),
      set: Effect.fn(function* (payload: typeof InitPayload.Type) {
        yield* writeItem(CONFIG_STORAGE_KEY, payload)
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
