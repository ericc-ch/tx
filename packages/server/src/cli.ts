#!/usr/bin/env node

import { NodeHttpServer, NodeRuntime, NodeServices } from "@effect/platform-node"
import { Effect, Layer, Option } from "effect"
import { Argument, Command, Flag } from "effect/unstable/cli"
import os from "node:os"
import { HttpRouter } from "effect/unstable/http"
import { RpcSerialization, RpcServer } from "effect/unstable/rpc"
import { createServer } from "node:http"
import packageJson from "../package.json" with { type: "json" }
import { RpcHandlers, ServerConfig } from "./rpc/handlers.ts"
import { RPC_PORT, ServerRpcs } from "./rpc/protocol.ts"
import { BrowserManager } from "./lib/browser.ts"

const Rpc = RpcServer.layerHttp({ group: ServerRpcs, path: "/rpc", protocol: "http" }).pipe(
  Layer.provide(RpcHandlers),
  Layer.provideMerge(RpcSerialization.layerNdjson),
  Layer.provideMerge(HttpRouter.cors()),
)

const ServerMain = HttpRouter.serve(Rpc).pipe(
  Layer.provide(NodeHttpServer.layer(() => createServer(), { port: RPC_PORT })),
)

const tiketCommand = Command.make(
  "tiket",
  {
    url: Argument.string("url"),
    count: Flag.integer("browser-count").pipe(
      Flag.withAlias("n"),
      Flag.withDescription("Number of browser instances to open"),
      Flag.withDefault(1),
    ),
    threshold: Flag.integer("threshold").pipe(
      Flag.withAlias("t"),
      Flag.withDescription("Queue threshold to kill browser"),
      Flag.withDefault(5000),
    ),
    browserPath: Flag.string("browser-path").pipe(
      Flag.withDescription("Path to browser executable (default: helium on PATH)"),
      Flag.optional,
    ),
    extensionPath: Flag.string("extension-path").pipe(
      Flag.withDescription("Path to built extension directory"),
    ),
  },
  ({ count, threshold, url }) =>
    Effect.gen(function* () {
      const browser = yield* BrowserManager
      const parallelism = Math.max(1, Math.floor(os.availableParallelism() / 2))
      yield* Effect.all(
        Array.from({ length: count }, () => browser.spawn(url)),
        { concurrency: parallelism },
      )
      return yield* Layer.launch(
        ServerMain.pipe(Layer.provide(Layer.succeed(ServerConfig, ServerConfig.of({ threshold })))),
      )
    }).pipe(Effect.scoped),
).pipe(
  Command.withDescription("Start tiket server and spawn browser"),
  Command.provide(({ browserPath, extensionPath }) =>
    BrowserManager.layer(extensionPath, Option.getOrUndefined(browserPath)),
  ),
)

const startCommand = Command.make("start").pipe(
  Command.withDescription("Start commands"),
  Command.withSubcommands([tiketCommand]),
)

const command = Command.make("tiket-tools", {}).pipe(
  Command.withDescription("Tiket tools server"),
  Command.withSubcommands([startCommand]),
)

const cli = Command.run(command, { version: packageJson.version })

const MainLayer = Layer.empty.pipe(Layer.provideMerge(NodeServices.layer))

NodeRuntime.runMain(cli.pipe(Effect.provide(MainLayer)))
