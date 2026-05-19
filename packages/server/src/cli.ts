#!/usr/bin/env node

import { NodeHttpServer, NodeRuntime, NodeServices } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { Command } from "effect/unstable/cli"
import { HttpRouter } from "effect/unstable/http"
import { RpcSerialization, RpcServer } from "effect/unstable/rpc"
import { createServer } from "node:http"
import packageJson from "../package.json" with { type: "json" }
import { RpcHandlers } from "./rpc/handlers.ts"
import { RPC_PORT, ServerRpcs } from "./rpc/protocol.ts"
import { BrowserManager } from "./lib/browser.ts"

const Rpc = RpcServer.layerHttp({ group: ServerRpcs, path: "/rpc", protocol: "http" }).pipe(
  Layer.provide(RpcHandlers),
  Layer.provideMerge(RpcSerialization.layerJsonRpc()),
)

const ServerMain = HttpRouter.serve(Rpc).pipe(
  Layer.provide(NodeHttpServer.layer(() => createServer(), { port: RPC_PORT })),
)

const startCommand = Command.make("start", {}, () => Layer.launch(ServerMain)).pipe(
  Command.withDescription("Start the RPC server"),
)

const testCommand = Command.make("test", {}, () =>
  Effect.gen(function* () {
    const browser = yield* BrowserManager

    yield* browser.spawnBrowser("google.com")
    yield* Effect.never
  }).pipe(Effect.scoped),
).pipe(Command.withDescription(""), Command.provide(BrowserManager.layer))

const command = Command.make("tiket-tools", {}).pipe(
  Command.withDescription("Tiket tools server"),
  Command.withSubcommands([startCommand, testCommand]),
)

const cli = Command.run(command, { version: packageJson.version })

const MainLayer = Layer.empty.pipe(Layer.provideMerge(NodeServices.layer))

NodeRuntime.runMain(cli.pipe(Effect.provide(MainLayer)))
