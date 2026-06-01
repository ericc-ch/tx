import { INIT_PAYLOAD_PARAM, InitPayload, InitPayloadFromUrlParam } from "@tx/server/schema"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { browser } from "wxt/browser"
import { makePersistedStore } from "./storage"

const initStore = makePersistedStore({ key: "local:init", schema: InitPayload })

export class Init extends Context.Service<Init>()("@tx/extension/Init", {
  make: Effect.sync(() => ({
    get: initStore.get,
    set: initStore.set,
  })),
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
        yield* Effect.logDebug("Captured and persisted init:", payload)
      }).pipe(Effect.runForkWith(context))
    })
  })
})
