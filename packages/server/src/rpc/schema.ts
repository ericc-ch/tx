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

export const CustomerDataFile = Schema.fromJsonString(Schema.Array(Customer))

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
