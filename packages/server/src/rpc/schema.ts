import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/unstable/rpc"

export const INIT_PAYLOAD_PARAM = "__init"

export const InitPayload = Schema.Struct({
  browserId: Schema.String,
  port: Schema.Number,
})

export const InitPayloadFromUrlParam = Schema.StringFromBase64Url.pipe(
  Schema.decodeTo(Schema.fromJsonString(InitPayload)),
)

export const CustomerRow = Schema.Struct({
  "Nama Lengkap": Schema.String,
  Email: Schema.String,
  "Tanggal Lahir": Schema.String,
  Gender: Schema.String,
  "NIK/KTP": Schema.String,
  "Nomor Telepon (contoh: 81234567890)": Schema.String,
  "Kategori Ticket": Schema.String,
  "Jumlah Ticket": Schema.String,
  "Day (contoh: day 1)": Schema.String,
  "Kode Membership (Presale Only)": Schema.String,
  "Metode Pembayaran": Schema.String,
})

export const Customer = Schema.Struct({
  name: Schema.String,
  email: Schema.String,
  birthDate: Schema.String,
  gender: Schema.String,
  nik: Schema.String,
  phone: Schema.String,
  categories: Schema.Array(Schema.String),
  ticketCount: Schema.Number,
  day: Schema.String,
  membershipCode: Schema.String,
  paymentMethod: Schema.String,
})

const parseCategories = (raw: string) =>
  raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)

export const decodeCustomerRow = (row: typeof CustomerRow.Type): typeof Customer.Type => ({
  name: row["Nama Lengkap"].trim(),
  email: row.Email.trim(),
  birthDate: row["Tanggal Lahir"].trim(),
  gender: row.Gender.trim(),
  nik: row["NIK/KTP"].trim(),
  phone: row["Nomor Telepon (contoh: 81234567890)"].trim(),
  categories: parseCategories(row["Kategori Ticket"]),
  ticketCount: Number.parseInt(row["Jumlah Ticket"].trim(), 10),
  day: row["Day (contoh: day 1)"].trim(),
  membershipCode: row["Kode Membership (Presale Only)"].trim(),
  paymentMethod: row["Metode Pembayaran"].trim(),
})

export const CustomerArray = Schema.Array(CustomerRow)

export const CustomerDataFile = Schema.fromJsonString(CustomerArray)

export const ClaimCustomerReq = Schema.Struct({
  browserId: Schema.String,
})

export const ClaimCustomerRes = Schema.Union([
  Schema.Struct({ customer: Customer }),
  Schema.Struct({ empty: Schema.Literal(true) }),
])

export const PushLogsPayload = Schema.Struct({
  browserId: Schema.String,
  messages: Schema.Array(Schema.String),
})

export const ServerRpcs = RpcGroup.make(
  Rpc.make("ClaimCustomer", {
    payload: ClaimCustomerReq,
    success: ClaimCustomerRes,
  }),
  Rpc.make("PushLogs", {
    payload: PushLogsPayload,
    success: Schema.Void,
  }),
)

export const customerKey = (customer: typeof Customer.Type) =>
  `${customer.email.toLowerCase().trim()}:${customer.nik.toLowerCase().trim()}`
