import { PoolRpcs } from "@tx/schema"
import { NodeHttpServer } from "@effect/platform-node"
import { Layer } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { RpcSerialization, RpcServer } from "effect/unstable/rpc"
import { createServer } from "node:http"
import { CustomerPool } from "./lib/customer-pool.ts"
import { PoolRpcHandlers } from "./rpc/handlers.ts"

const RpcLive = RpcServer.layerHttp({ group: PoolRpcs, path: "/rpc", protocol: "http" }).pipe(
  Layer.provide(PoolRpcHandlers),
  Layer.provideMerge(RpcSerialization.layerNdjson),
  Layer.provide(CustomerPool.layer),
)

export const poolServerLayer = (host: string, port: number) =>
  HttpRouter.serve(RpcLive, { disableLogger: true }).pipe(
    Layer.provideMerge(NodeHttpServer.layer(() => createServer(), { host, port })),
  )
