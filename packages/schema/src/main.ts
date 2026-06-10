import { Config, Schema } from "effect"
import { Rpc, RpcGroup } from "effect/unstable/rpc"

export const INIT_PAYLOAD_PARAM = "__init"

export const InitPayload = Schema.Struct({
  browserId: Schema.String,
  port: Schema.Number,
  minimumLogLevel: Schema.optional(Config.LogLevel),
})

export const InitPayloadFromUrlParam = Schema.StringFromBase64Url.pipe(
  Schema.decodeTo(Schema.fromJsonString(InitPayload)),
)

export const Customer = Schema.Struct({
  name: Schema.String.annotateKey({
    description:
      "Full name on the booking. Filled into the contact detail form (#full-name / #nama-lengkap) on the order page.",
  }),
  email: Schema.String.annotateKey({
    description:
      "Contact email. Filled on the order page, included in Discord payment alerts, and used with nik as the pool identity (email:nik).",
  }),
  birthDate: Schema.String.annotateKey({
    description:
      "Date of birth in YYYY-MM-DD. Stored in the customer record and normalized from CSV; not filled by the extension on the current Tiket checkout flow.",
  }),
  gender: Schema.String.annotateKey({
    description:
      'Salutation selector on the order page. Use "female" or "male" (normalized to lowercase). Maps to Ms/Nona vs Mr/Tuan.',
  }),
  nik: Schema.String.annotateKey({
    description:
      "National ID (KTP) number. Filled into the visitor detail sheet (#identity-card-number / #nomor-ktp). Combined with email for pool deduplication.",
  }),
  phone: Schema.String.annotateKey({
    description:
      "Mobile number without a leading 0 (e.g. 81234567890). Filled into the contact detail phone field (#mobile-number / #nomor-ponsel).",
  }),
  categories: Schema.NonEmptyArray(Schema.NonEmptyString).annotateKey({
    description:
      "Required package tier priority list, tried in order. Each entry is matched as a case-insensitive substring of a package card title on the packages page.",
  }),
  ticketCount: Schema.Number.annotateKey({
    description:
      "Number of tickets to buy. The extension sets package quantity to this value before clicking Book/Pesan.",
  }),
  day: Schema.String.annotateKey({
    description:
      'Show day label (e.g. "day 1"). Stored and normalized from CSV; event day is selected via the start URL today, not this field.',
  }),
  membershipCode: Schema.String.annotateKey({
    description:
      "Presale or membership verification code. Required when the packages page shows a presale flow; entered before quantity selection. Empty on a presale page discards the customer.",
  }),
  paymentMethod: Schema.String.annotateKey({
    description:
      'Payment method label on the payment page. Must match Tiket UI text exactly (e.g. "BCA Virtual Account", "Mandiri Virtual Account").',
  }),
}).annotate({
  description:
    "One checkout attempt: a single person, ticket preferences, and payment method claimed by one browser instance.",
})

export const CustomerDataFile = Schema.fromJsonString(
  Schema.Array(Customer).annotate({
    description: "JSON file containing a list of customers for tx tiket start or tx server start.",
  }),
)

export const customerKey = (customer: typeof Customer.Type) =>
  `${customer.email.toLowerCase().trim()}:${customer.nik.toLowerCase().trim()}`

export const ClaimNextRes = Schema.Union([
  Schema.Struct({ customer: Customer }),
  Schema.Struct({ empty: Schema.Literal(true) }),
])

export const ResolvePayload = Schema.Struct({
  customerKey: Schema.String,
  outcome: Schema.Union([Schema.Literal("finished"), Schema.Literal("discarded")]),
})

export const PoolRpcs = RpcGroup.make(
  Rpc.make("ClaimNext", {
    success: ClaimNextRes,
  }),
  Rpc.make("Resolve", {
    payload: ResolvePayload,
    success: Schema.Void,
  }),
)

export const ClaimCustomerReq = Schema.Struct({
  browserId: Schema.String,
})

export const ResolveCustomerPayload = Schema.Struct({
  browserId: Schema.String,
  customerKey: Schema.String,
  outcome: Schema.Union([Schema.Literal("finished"), Schema.Literal("discarded")]),
  reason: Schema.String,
})

export const RemoteLogEntry = Schema.Struct({
  level: Config.LogLevel,
  message: Schema.Array(Schema.Unknown),
})

export const PushLogsPayload = Schema.Struct({
  browserId: Schema.String,
  entries: Schema.Array(RemoteLogEntry),
})

export const ReportPaymentConfirmPayload = Schema.Struct({
  browserId: Schema.String,
  virtualAccount: Schema.String,
  customerEmail: Schema.String,
  paymentMethod: Schema.String,
  screenshotBase64: Schema.String,
})

export const OperatorRpcs = RpcGroup.make(
  Rpc.make("ClaimCustomer", {
    payload: ClaimCustomerReq,
    success: ClaimNextRes,
  }),
  Rpc.make("ResolveCustomer", {
    payload: ResolveCustomerPayload,
    success: Schema.Void,
  }),
  Rpc.make("PushLogs", {
    payload: PushLogsPayload,
    success: Schema.Void,
  }),
  Rpc.make("ReportPaymentConfirm", {
    payload: ReportPaymentConfirmPayload,
    success: Schema.Void,
  }),
)
