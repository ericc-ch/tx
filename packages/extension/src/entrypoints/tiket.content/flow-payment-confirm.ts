import { Init } from "@/lib/init"
import { CustomerStore } from "@/lib/customer-store"
import { captureTabScreenshot } from "@/lib/screenshot"
import { makePersistedStore } from "@/lib/storage"
import { ServerRpcs } from "@tx/server/schema"
import { Duration, Effect, Option, Schema } from "effect"
import { RpcClient } from "effect/unstable/rpc"

const reportedVaStore = makePersistedStore({
  key: "local:payment-reported-va",
  schema: Schema.String,
})

export const virtualAccountFromRoot = (root: ParentNode) => {
  for (const heading of root.querySelectorAll("h3")) {
    const text = heading.textContent?.trim() ?? ""
    if (/^IDR\b/i.test(text)) continue
    const digits = text.replace(/\s/g, "")
    if (/^\d{10,16}$/.test(digits)) return digits
  }
  return undefined
}

export const runPaymentConfirm = Effect.gen(function* () {
  const store = yield* CustomerStore
  const customer = yield* store.require()

  const init = yield* Init
  const initPayload = yield* init.get()
  if (Option.isNone(initPayload)) {
    return yield* Effect.die(new Error("Extension init not loaded"))
  }

  const deadline = Date.now() + Duration.toMillis(Duration.seconds(30))
  let virtualAccount: string | undefined
  while (Date.now() < deadline) {
    virtualAccount = virtualAccountFromRoot(document)
    if (virtualAccount) break
    yield* Effect.sleep(Duration.millis(100))
  }
  if (!virtualAccount) {
    return yield* Effect.die(new Error("virtual account not found on payment confirm page"))
  }

  if (!initPayload.value.notifyPayment) {
    yield* Effect.logInfo("Payment confirm", customer.email, virtualAccount)
    return
  }

  const reported = yield* reportedVaStore.get()
  if (Option.exists(reported, (value) => value === virtualAccount)) return

  const screenshotBase64 = yield* captureTabScreenshot
  const client = yield* RpcClient.make(ServerRpcs)

  yield* client.ReportPaymentConfirm({
    browserId: initPayload.value.browserId,
    virtualAccount,
    customerEmail: customer.email,
    paymentMethod: customer.paymentMethod,
    screenshotBase64,
  })

  yield* reportedVaStore.set(virtualAccount)
})
