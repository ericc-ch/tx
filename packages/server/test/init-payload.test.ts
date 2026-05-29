import { describe, expect, it } from "@effect/vitest"
import { Schema } from "effect"
import {
  customerKey,
  decodeCustomerRow,
  INIT_PAYLOAD_PARAM,
  InitPayloadFromUrlParam,
} from "../src/rpc/schema.ts"

const sampleRow = {
  Timestamp: "5/23/2026 12:20:33",
  "Nama Lengkap": "Tono Tenda",
  Email: "tonotenda@example.com",
  "Tanggal Lahir": "7/13/2003",
  Gender: "Female",
  "NIK/KTP": "3122022302230022",
  "Nomor Telepon (contoh: 81234567890)": "082259225223",
  "Kategori Ticket": "cat 1, last forever fan, festival",
  "Jumlah Ticket": "1",
  "Day (contoh: day 1)": "Day 1 /Day2",
  "Kode Membership (Presale Only)": "BA203480222",
  "Metode Pembayaran": "BCA ",
}

describe("InitPayloadFromUrlParam", () => {
  it("roundtrips browserId, port, and maxRetries", () => {
    const payload = { browserId: "swift-otter", port: 54321, maxRetries: 3 }
    const encoded = Schema.encodeSync(InitPayloadFromUrlParam)(payload)
    expect(Schema.decodeUnknownSync(InitPayloadFromUrlParam)(encoded)).toEqual(payload)
  })

  it("decodes from a URL search param", () => {
    const payload = { browserId: "test-browser", port: 9000, maxRetries: 5 }
    const url = new URL("https://example.com/event")
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

describe("decodeCustomerRow", () => {
  it("maps fixture row fields to normalized customer", () => {
    expect(decodeCustomerRow(sampleRow)).toEqual({
      name: "Tono Tenda",
      email: "tonotenda@example.com",
      birthDate: "7/13/2003",
      gender: "Female",
      nik: "3122022302230022",
      phone: "082259225223",
      categories: ["cat 1", "last forever fan", "festival"],
      ticketCount: 1,
      day: "Day 1 /Day2",
      membershipCode: "BA203480222",
      paymentMethod: "BCA",
    })
  })

  it("builds stable dedup keys", () => {
    const customer = decodeCustomerRow(sampleRow)
    expect(customerKey(customer)).toBe("tonotenda@example.com:3122022302230022")
  })
})
