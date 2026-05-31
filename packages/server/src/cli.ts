#!/usr/bin/env node

import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Console, Effect, FileSystem, Formatter, Path } from "effect"
import { Argument, Command, Flag } from "effect/unstable/cli"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { HttpServer } from "effect/unstable/http"
import os from "node:os"
import packageJson from "../package.json" with { type: "json" }
import { BrowserLauncher, browserSwitches } from "./lib/browser-launcher.ts"
import { TxConfig } from "./lib/config.ts"
import { TiketLive } from "./layers.ts"

const templateProfileDirectory = "template-draft"

const tiketStartCommand = Command.make(
  "start",
  {
    url: Argument.string("url"),
    count: Flag.integer("browser-count").pipe(
      Flag.withAlias("n"),
      Flag.withDescription("Number of browser instances to open"),
      Flag.withDefault(1),
    ),
  },
  Effect.fn(
    function* ({ count, url }) {
      const server = yield* HttpServer.HttpServer
      const { port } = server.address as HttpServer.TcpAddress
      yield* Effect.logInfo("Server is listening on port", port)

      const browser = yield* BrowserLauncher
      const parallelism = Math.max(1, Math.floor(os.availableParallelism() / 2))
      yield* Effect.all(
        Array.from({ length: count }, () => browser.spawn({ url, port })),
        { concurrency: parallelism },
      )
      return yield* Effect.never
    },
    Effect.provide(TiketLive),
    Effect.scoped,
  ),
).pipe(Command.withDescription("Start tiket server and spawn browsers"))

const templateCreateCommand = Command.make(
  "create",
  {},
  Effect.fn(
    function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
      const { config, paths } = yield* TxConfig
      const { userDataDir, templateDir } = paths
      const profilePath = path.join(userDataDir, templateProfileDirectory)

      if (yield* fs.exists(profilePath)) {
        yield* fs.remove(profilePath, { recursive: true, force: true })
      }

      yield* Effect.acquireUseRelease(
        spawner.spawn(
          ChildProcess.make(config.browserExecutable, [
            `--user-data-dir=${userDataDir}`,
            `--profile-directory=${templateProfileDirectory}`,
            ...browserSwitches,
          ]),
        ),
        Effect.fn(function* (handle) {
          yield* Effect.logInfo("Log in, then close the browser when done")
          yield* handle.exitCode
        }),
        Effect.fn(function* () {
          if (!(yield* fs.exists(profilePath))) {
            yield* Effect.logWarning("No profile to save at", profilePath)
            return
          }

          if (yield* fs.exists(templateDir)) {
            yield* Effect.logInfo("Replacing existing template at", templateDir)
            yield* fs.remove(templateDir, { recursive: true, force: true })
          }

          yield* fs.rename(profilePath, templateDir)
          yield* Effect.logInfo("Template saved at", templateDir)
        }, Effect.orDie),
      )
    },
    Effect.provide(TxConfig.layer),
    Effect.scoped,
  ),
).pipe(Command.withDescription("Create a template profile by logging in once"))

const templateCommand = Command.make("template").pipe(
  Command.withDescription("Manage the browser profile template"),
  Command.withSubcommands([templateCreateCommand]),
)

const tiketCommand = Command.make("tiket").pipe(
  Command.withDescription("Tiket automation"),
  Command.withSubcommands([tiketStartCommand, templateCommand]),
)

const debugPathsCommand = Command.make(
  "paths",
  {},
  Effect.fn(function* () {
    const { paths } = yield* TxConfig
    yield* Console.log(Formatter.format(paths, { space: 2 }))
  }, Effect.provide(TxConfig.layer)),
).pipe(Command.withDescription("Print env-paths roots and derived app directories"))

const debugConfigCommand = Command.make(
  "config",
  {},
  Effect.fn(function* () {
    const { config } = yield* TxConfig
    yield* Console.log(Formatter.formatJson(config, { space: 2 }))
  }, Effect.provide(TxConfig.layer)),
).pipe(Command.withDescription("Print resolved config.json"))

const debugCommand = Command.make("debug").pipe(
  Command.withDescription("Debug and introspection"),
  Command.withSubcommands([debugPathsCommand, debugConfigCommand]),
)

const command = Command.make("tx", {}).pipe(
  Command.withDescription("tx server"),
  Command.withSubcommands([tiketCommand, debugCommand]),
)

const cli = Command.run(command, { version: packageJson.version })

NodeRuntime.runMain(cli.pipe(Effect.provide(NodeServices.layer)))
