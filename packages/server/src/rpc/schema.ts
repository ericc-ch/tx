import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/unstable/rpc"

export const INIT_PAYLOAD_PARAM = "__init"

export const QueuePosition = Schema.Struct({
  peopleAhead: Schema.Number,
  browserId: Schema.String,
})

export const QueuePositionAck = Schema.Struct({
  peopleAhead: Schema.Number,
  threshold: Schema.Number,
  closed: Schema.Boolean,
})

export const ServerRpcs = RpcGroup.make(
  Rpc.make("ReportQueuePosition", {
    payload: QueuePosition,
    success: QueuePositionAck,
  }),
)
