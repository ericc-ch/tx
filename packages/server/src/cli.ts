#!/usr/bin/env node

import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Console, Effect, FileSystem, Formatter, Path, Schema, Terminal } from "effect"
import { Argument, Command, Flag, Prompt } from "effect/unstable/cli"
import { HttpServer } from "effect/unstable/http"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import os from "node:os"
import open from "open"
import packageJson from "../package.json" with { type: "json" }
import { TiketLive } from "./layers.ts"
import { BrowserLauncher, browserSwitches } from "./lib/browser-launcher.ts"
import { PROFILE_TEMPLATE_DIRECTORY, TxConfig, TxConfigSchema } from "./lib/config.ts"

const templateCreateProfileDirectory = "Draft"

const templateCreateCommand = Command.make(
  "create",
  {},
  Effect.fn(
    function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
      const { config, paths } = yield* TxConfig
      const { templateDir } = paths
      const tempUserDataDir = yield* fs.makeTempDirectoryScoped({
        prefix: "tx-template-create-",
      })
      const profilePath = path.join(tempUserDataDir, templateCreateProfileDirectory)
      const handle = yield* spawner.spawn(
        ChildProcess.make(config.browserExecutable, [
          `--user-data-dir=${tempUserDataDir}`,
          `--profile-directory=${templateCreateProfileDirectory}`,
          ...browserSwitches,
        ]),
      )

      yield* Effect.logInfo("Log in, then close the browser when done")
      yield* handle.exitCode

      if (!(yield* fs.exists(profilePath))) {
        yield* Effect.logWarning("No profile to save at", profilePath)
        return
      }

      const save = yield* Prompt.run(
        Prompt.confirm({
          message: "Save as template?",
          initial: false,
        }),
      ).pipe(Effect.catchIf(Terminal.isQuitError, () => Effect.succeed(false)))

      if (!save) {
        yield* Effect.logDebug("Template not saved")
        return
      }

      if (yield* fs.exists(templateDir)) {
        yield* Effect.logDebug("Replacing existing template at", templateDir)
        yield* fs.remove(templateDir, { recursive: true, force: true })
      }

      yield* fs.copy(profilePath, templateDir)
      yield* Effect.logInfo("Template saved at", templateDir)
    },
    Effect.provide(TxConfig.layer),
    Effect.scoped,
  ),
).pipe(
  Command.withDescription(
    "Create a fresh template profile in a temp browser; save replaces any existing template",
  ),
)

const templateUpdateCommand = Command.make(
  "update",
  {},
  Effect.fn(function* () {
    const fs = yield* FileSystem.FileSystem
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const { config, paths } = yield* TxConfig
    const { userDataDir, templateDir } = paths

    if (!(yield* fs.exists(templateDir))) {
      return yield* Effect.die(
        new Error(
          `Template profile not found at ${templateDir}. Create one with: tx tiket template create`,
        ),
      )
    }

    const handle = yield* spawner.spawn(
      ChildProcess.make(config.browserExecutable, [
        `--user-data-dir=${userDataDir}`,
        `--profile-directory=${PROFILE_TEMPLATE_DIRECTORY}`,
        ...browserSwitches,
      ]),
    )

    yield* Effect.logInfo("Update the template, then close the browser when done")
    yield* handle.exitCode
    yield* Effect.logInfo("Template updated at", templateDir)
  }, Effect.provide(TxConfig.layer)),
).pipe(Command.withDescription("Open the existing template profile to refresh login state"))

const templateCommand = Command.make("template").pipe(
  Command.withDescription("Manage the browser profile template"),
  Command.withSubcommands([templateCreateCommand, templateUpdateCommand]),
)

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

const debugConfigSchemaCommand = Command.make(
  "schema",
  {},
  Effect.fn(function* () {
    const document = Schema.toJsonSchemaDocument(TxConfigSchema)
    yield* Console.log(Formatter.formatJson(document.schema, { space: 2 }))
  }),
).pipe(Command.withDescription("Print config.json JSON Schema"))

const debugConfigOpenCommand = Command.make(
  "open",
  {},
  Effect.fn(function* () {
    const { paths } = yield* TxConfig
    yield* Effect.tryPromise(() => open(paths.configFilePath))
  }, Effect.provide(TxConfig.layer)),
).pipe(Command.withDescription("Open config.json in the default application"))

const debugConfigCommand = Command.make(
  "config",
  {},
  Effect.fn(function* () {
    const { config } = yield* TxConfig
    yield* Console.log(Formatter.formatJson(config, { space: 2 }))
  }, Effect.provide(TxConfig.layer)),
).pipe(
  Command.withDescription("Print resolved config.json"),
  Command.withSubcommands([debugConfigSchemaCommand, debugConfigOpenCommand]),
)

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
