import { NodeHttpServer } from "@effect/platform-node"
import { Layer } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { RpcSerialization, RpcServer } from "effect/unstable/rpc"
import { createServer } from "node:http"
import { BrowserLauncher } from "./lib/browser-launcher.ts"
import { CustomerPool } from "./lib/customer-pool.ts"
import { TxConfig } from "./lib/config.ts"
import { RpcHandlers } from "./rpc/handlers.ts"
import { ServerRpcs } from "./rpc/schema.ts"

const RpcLive = RpcServer.layerHttp({ group: ServerRpcs, path: "/rpc", protocol: "http" }).pipe(
  Layer.provide(RpcHandlers),
  Layer.provideMerge(RpcSerialization.layerNdjson),
)

export const ServerLive = HttpRouter.serve(RpcLive, { disableLogger: true }).pipe(
  Layer.provideMerge(NodeHttpServer.layer(() => createServer(), { port: 0 })),
)

const AppServicesLive = Layer.mergeAll(CustomerPool.layer, BrowserLauncher.layer).pipe(
  Layer.provide(TxConfig.layer),
)

export const TiketLive = ServerLive.pipe(Layer.provideMerge(AppServicesLive))
