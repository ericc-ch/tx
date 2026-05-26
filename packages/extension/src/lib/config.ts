import {
  INIT_PAYLOAD_PARAM,
  InitPayload,
  InitPayloadFromUrlParam,
} from "@tx/server/schema"
import { Context, Effect, Layer, Option, Schema, pipe } from "effect"
import { browser } from "wxt/browser"
import { storage } from "wxt/utils/storage"

const CONFIG_STORAGE_KEY = "local:config"

const read = () =>
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

const payloadFromUrl = (url: string) =>
  Effect.gen(function* () {
    const encoded = new URL(url).searchParams.get(INIT_PAYLOAD_PARAM)
    if (encoded === null) return Option.none()

    const payload = yield* Schema.decodeUnknownEffect(InitPayloadFromUrlParam)(encoded).pipe(
      Effect.orDie,
    )
    return Option.some(payload)
  })

export class Config extends Context.Service<Config>()("tx/Config", {
  make: Effect.sync(() => ({
    get: () =>
      read().pipe(
        Effect.flatMap((config) =>
          Option.isNone(config)
            ? Effect.die(new Error("Extension config not loaded"))
            : Effect.succeed(config.value),
        ),
      ),
    set: (payload: typeof InitPayload.Type) =>
      Effect.tryPromise(() => storage.setItem(CONFIG_STORAGE_KEY, payload)).pipe(Effect.orDie),
  })),
}) {
  static layer = Layer.effect(this, this.make)
}

export const registerConfigCapture = Effect.gen(function* () {
  const config = yield* Config

  yield* Effect.sync(() => {
    browser.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
      const url = changeInfo.url ?? tab.url
      if (!url) return

      pipe(
        payloadFromUrl(url),
        Effect.flatMap((payload) =>
          Option.match(payload, {
            onNone: () => Effect.void,
            onSome: (value) =>
              config.set(value).pipe(
                Effect.tap(() =>
                  Effect.logInfo(`Captured and persisted config: ${JSON.stringify(value)}`),
                ),
              ),
          }),
        ),
        Effect.runFork,
      )
    })
  })
})
