import { registerInitCapture } from "@/lib/init"
import { BackgroundLive, registerRpcTunnel } from "@/lib/rpc"
import { BrowserRuntime } from "@effect/platform-browser"
import { Effect } from "effect"

const main = Effect.gen(function* () {
  yield* Effect.logInfo("Background service worker started")
  yield* registerInitCapture
  yield* registerRpcTunnel
})

export default defineBackground(() => {
  main.pipe(Effect.provide(BackgroundLive), BrowserRuntime.runMain)
})
