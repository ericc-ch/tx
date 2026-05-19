import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/unstable/rpc"

export const RPC_PORT = 8211
export const RPC_HTTP_URL = `http://localhost:${RPC_PORT}/rpc`

export const QueuePosition = Schema.Struct({
  peopleAhead: Schema.Number,
})

export const ServerRpcs = RpcGroup.make(
  Rpc.make("ReportQueuePosition", {
    payload: QueuePosition,
    success: Schema.Void,
  }),
)
