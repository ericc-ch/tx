import { BrowserHttpClient } from "@effect/platform-browser"
import { RPC_HTTP_URL } from "@tiket-tools/server/protocol"
import { Layer } from "effect"
import { RpcClient, RpcSerialization } from "effect/unstable/rpc"

export const RpcClientLayer = RpcClient.layerProtocolHttp({ url: RPC_HTTP_URL }).pipe(
  Layer.provideMerge(RpcSerialization.layerNdjson),
  Layer.provideMerge(BrowserHttpClient.layerFetch),
)
