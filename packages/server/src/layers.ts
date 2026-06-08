import { NodeHttpServer } from "@effect/platform-node"
import { Layer } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { RpcSerialization, RpcServer } from "effect/unstable/rpc"
import { createServer } from "node:http"
import { BrowserLauncher } from "./lib/browser-launcher.ts"
import { CustomerPool } from "./lib/customer-pool.ts"
import { TxConfig } from "./lib/config.ts"
import { Discord } from "./lib/discord.ts"
import { RpcHandlers } from "./rpc/handlers.ts"
import { ServerRpcs } from "./rpc/schema.ts"

const RpcLive = RpcServer.layerHttp({ group: ServerRpcs, path: "/rpc", protocol: "http" }).pipe(
  Layer.provide(RpcHandlers),
  Layer.provideMerge(RpcSerialization.layerNdjson),
  Layer.provide(CustomerPool.layer),
  Layer.provide(Discord.layer),
)

const ServerLive = HttpRouter.serve(RpcLive, { disableLogger: true }).pipe(
  Layer.provideMerge(NodeHttpServer.layer(() => createServer(), { port: 0 })),
)

export const TiketLive = ServerLive.pipe(
  Layer.provideMerge(BrowserLauncher.layer),
  Layer.provide(TxConfig.layer),
)
