import { Data, Effect, Schema } from "effect"
import { browser } from "wxt/browser"

class ScreenshotCaptureError extends Data.TaggedError("ScreenshotCaptureError")<{
  readonly cause: unknown
}> {}

export const CaptureScreenshotMsg = Schema.TaggedStruct("CaptureScreenshot", {})

export const registerScreenshotCapture = Effect.sync(() => {
  browser.runtime.onMessage.addListener((message, sender) => {
    if (!Schema.is(CaptureScreenshotMsg)(message)) return false

    const windowId = sender.tab?.windowId
    if (windowId === undefined) {
      return Promise.reject(new Error("screenshot capture requires a content-script tab"))
    }

    return browser.tabs.captureVisibleTab(windowId, { format: "png" })
  })
})

export const captureTabScreenshot = Effect.gen(function* () {
  const dataUrl = yield* Effect.tryPromise({
    try: () => browser.runtime.sendMessage(CaptureScreenshotMsg.make({})),
    catch: (cause) => new ScreenshotCaptureError({ cause }),
  }).pipe(Effect.orDie)

  if (typeof dataUrl !== "string") {
    return yield* Effect.die(new ScreenshotCaptureError({ cause: "no data url" }))
  }

  const base64 = dataUrl.replace(/^data:image\/png;base64,/, "")
  if (base64.length === 0) {
    return yield* Effect.die(new ScreenshotCaptureError({ cause: "empty image" }))
  }

  return base64
})
