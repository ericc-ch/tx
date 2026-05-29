import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/unstable/rpc"

export const INIT_PAYLOAD_PARAM = "__init"

export const InitPayload = Schema.Struct({
  browserId: Schema.String,
  port: Schema.Number,
  membershipPresaleCode: Schema.optional(Schema.String),
})

export const InitPayloadFromUrlParam = Schema.StringFromBase64Url.pipe(
  Schema.decodeTo(Schema.fromJsonString(InitPayload)),
)

export const QueuePosition = Schema.Struct({
  peopleAhead: Schema.Number,
  browserId: Schema.String,
})

export const QueuePositionAck = Schema.Struct({
  peopleAhead: Schema.Number,
  threshold: Schema.Number,
  closed: Schema.Boolean,
})

export const PushLogsPayload = Schema.Struct({
  browserId: Schema.String,
  messages: Schema.Array(Schema.String),
})

export const ServerRpcs = RpcGroup.make(
  Rpc.make("ReportQueuePosition", {
    payload: QueuePosition,
    success: QueuePositionAck,
  }),
  Rpc.make("PushLogs", {
    payload: PushLogsPayload,
    success: Schema.Void,
  }),
)
