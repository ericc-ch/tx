import { INIT_PAYLOAD_PARAM, InitPayload, InitPayloadFromUrlParam } from "@tx/server/schema"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { browser } from "wxt/browser"
import { readItem, writeItem } from "./storage"

const INIT_STORAGE_KEY = "local:init"

export class Init extends Context.Service<Init>()("@tx/extension/Init", {
  make: Effect.sync(() => {
    return {
      get: Effect.fn(function* () {
        return yield* readItem(INIT_STORAGE_KEY, InitPayload, "Extension init not loaded")
      }),
      set: Effect.fn(function* (payload: typeof InitPayload.Type) {
        yield* writeItem(INIT_STORAGE_KEY, payload)
      }),
    }
  }),
}) {
  static layer = Layer.effect(this, this.make)
}

export const registerInitCapture = Effect.gen(function* () {
  const init = yield* Init
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

        yield* init.set(payload)
        yield* Effect.logInfo("Captured and persisted init:", payload)
      }).pipe(Effect.runForkWith(context))
    })
  })
})
