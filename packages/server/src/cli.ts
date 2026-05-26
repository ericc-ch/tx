#!/usr/bin/env node

import { NodeHttpServer, NodeRuntime, NodeServices } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { Argument, Command, Flag } from "effect/unstable/cli"
import os from "node:os"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { RpcSerialization, RpcServer } from "effect/unstable/rpc"
import { createServer } from "node:http"
import packageJson from "../package.json" with { type: "json" }
import { RpcHandlers, ServerConfig } from "./rpc/handlers.ts"
import { ServerRpcs } from "./rpc/schema.ts"
import { BrowserManager } from "./lib/browser.ts"
import { corsForExtension } from "./lib/cors.ts"

const Rpc = RpcServer.layerHttp({ group: ServerRpcs, path: "/rpc", protocol: "http" }).pipe(
  Layer.provide(RpcHandlers),
  Layer.provideMerge(RpcSerialization.layerNdjson),
  Layer.provideMerge(corsForExtension()),
)

const ServerMain = HttpRouter.serve(Rpc).pipe(
  Layer.provideMerge(NodeHttpServer.layer(() => createServer(), { port: 0 })),
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
      Flag.withDescription("Path to browser executable"),
    ),
    extensionPath: Flag.string("extension-path").pipe(
      Flag.withDescription("Path to built extension directory"),
    ),
  },
  ({ count, threshold, url }) =>
    Effect.gen(function* () {
      const runServerAndBrowser = Effect.gen(function* () {
        const server = yield* HttpServer.HttpServer
        const port = server.address._tag === "TcpAddress" ? server.address.port : 0
        yield* Effect.logInfo(`Server is listening on port ${port}`)

        const browser = yield* BrowserManager
        const parallelism = Math.max(1, Math.floor(os.availableParallelism() / 2))
        yield* Effect.all(
          Array.from({ length: count }, () => browser.spawn({ url, port })),
          { concurrency: parallelism },
        )
        return yield* Effect.never
      }).pipe(
        Effect.provide(
          ServerMain.pipe(
            Layer.provide(Layer.succeed(ServerConfig, ServerConfig.of({ threshold }))),
          ),
        ),
      )

      return yield* runServerAndBrowser
    }).pipe(Effect.scoped),
).pipe(
  Command.withDescription("Start tiket server and spawn browser"),
  Command.provide(({ browserPath, extensionPath }) =>
    BrowserManager.layer({ browserPath, extensionPath }),
  ),
)

const startCommand = Command.make("start").pipe(
  Command.withDescription("Start commands"),
  Command.withSubcommands([tiketCommand]),
)

const command = Command.make("tx", {}).pipe(
  Command.withDescription("tx server"),
  Command.withSubcommands([startCommand]),
)

const cli = Command.run(command, { version: packageJson.version })

const MainLayer = Layer.empty.pipe(Layer.provideMerge(NodeServices.layer))

NodeRuntime.runMain(cli.pipe(Effect.provide(MainLayer)))
