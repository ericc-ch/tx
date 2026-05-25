import { describe, expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { INIT_PAYLOAD_PARAM, InitPayloadFromUrlParam } from "../src/rpc/schema.ts"

describe("InitPayloadFromUrlParam", () => {
  it("roundtrips browserId and port", () => {
    const payload = { browserId: "swift-otter", port: 54321 }
    const encoded = Schema.encodeSync(InitPayloadFromUrlParam)(payload)
    expect(Schema.decodeUnknownSync(InitPayloadFromUrlParam)(encoded)).toEqual(payload)
  })

  it("decodes from a URL search param", () => {
    const payload = { browserId: "test-browser", port: 9000 }
    const url = new URL("https://example.com/queue")
    url.searchParams.set(INIT_PAYLOAD_PARAM, Schema.encodeSync(InitPayloadFromUrlParam)(payload))

    const encoded = url.searchParams.get(INIT_PAYLOAD_PARAM)
    expect(encoded).not.toBeNull()
    expect(Schema.decodeUnknownSync(InitPayloadFromUrlParam)(encoded!)).toEqual(payload)
  })

  it("fails on invalid base64", () => {
    expect(() => Schema.decodeUnknownSync(InitPayloadFromUrlParam)("not-valid!!!")).toThrow()
  })

  it("fails on invalid json shape", () => {
    const encoded = Schema.encodeSync(Schema.StringFromBase64Url)('{"browserId":"x"}')
    expect(() => Schema.decodeUnknownSync(InitPayloadFromUrlParam)(encoded)).toThrow()
  })
})
