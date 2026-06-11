import { INIT_PAYLOAD_PARAM, InitPayload, InitPayloadFromUrlParam, OperatorRpcs } from "@tx/schema"
import { Context, Duration, Effect, Layer, Option, Schedule, Schema } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { RpcClient, RpcSerialization } from "effect/unstable/rpc"
import { browser } from "wxt/browser"
import { makePersistedStore } from "./storage"

const browserReadyRetry = Schedule.both(Schedule.spaced(Duration.millis(500)), Schedule.recurs(5))

const reportBrowserReady = (port: number, browserId: string) =>
  Effect.gen(function* () {
    const client = yield* RpcClient.make(OperatorRpcs)
    yield* client.BrowserReady({ browserId })
  }).pipe(
    Effect.provide(
      RpcClient.layerProtocolHttp({ url: `http://localhost:${port}/rpc` }).pipe(
        Layer.provideMerge(RpcSerialization.layerNdjson),
        Layer.provideMerge(FetchHttpClient.layer),
      ),
    ),
  )

const initStore = makePersistedStore({ key: "local:init", schema: InitPayload })

const encodedInitFromUrl = (candidate: string | undefined) => {
  if (!candidate) return Option.none<string>()
  try {
    const url = new URL(candidate)
    const direct = url.searchParams.get(INIT_PAYLOAD_PARAM)
    if (direct) return Option.some(direct)

    const redirectTarget = url.searchParams.get("t")
    if (redirectTarget) {
      const nested = new URL(redirectTarget).searchParams.get(INIT_PAYLOAD_PARAM)
      if (nested) return Option.some(nested)
    }
  } catch {
    return Option.none()
  }
  return Option.none()
}

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

  const captureFromUrl = (url: string) =>
    Effect.gen(function* () {
      const encoded = encodedInitFromUrl(url)
      if (Option.isNone(encoded)) return

      const existing = yield* init.get()
      if (Option.isSome(existing)) return

      const payload = yield* Schema.decodeUnknownEffect(InitPayloadFromUrlParam)(
        encoded.value,
      ).pipe(Effect.orDie)

      yield* init.set(payload)
      yield* Effect.logDebug("Captured and persisted init:", payload)
      yield* reportBrowserReady(payload.port, payload.browserId).pipe(
        Effect.retry(browserReadyRetry),
        Effect.tapError((error) => Effect.logWarning("BrowserReady failed", error)),
        Effect.ignore,
      )
    })

  yield* Effect.sync(() => {
    void browser.tabs.query({}).then((tabs) => {
      for (const tab of tabs) {
        if (!tab.url || Option.isNone(encodedInitFromUrl(tab.url))) continue
        captureFromUrl(tab.url).pipe(Effect.scoped, Effect.runForkWith(context))
      }
    })

    browser.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
      const captureUrl = [changeInfo.url, tab.url].find(
        (candidate) => candidate !== undefined && Option.isSome(encodedInitFromUrl(candidate)),
      )
      if (!captureUrl) return

      captureFromUrl(captureUrl).pipe(Effect.scoped, Effect.runForkWith(context))
    })
  })
})
