#!/usr/bin/env node

import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Effect, FileSystem, Path } from "effect"
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
        Effect.fn(
          function* () {
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
          },
          Effect.orDie,
        ),
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

const command = Command.make("tx", {}).pipe(
  Command.withDescription("tx server"),
  Command.withSubcommands([tiketCommand]),
)

const cli = Command.run(command, { version: packageJson.version })

NodeRuntime.runMain(cli.pipe(Effect.provide(NodeServices.layer)))
