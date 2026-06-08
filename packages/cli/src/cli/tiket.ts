import { NodeHttpServer } from "@effect/platform-node"
import { OperatorRpcs } from "@tx/schema"
import { Effect, FileSystem, Layer, Option, Path, Terminal } from "effect"
import { Argument, Command, Flag, Prompt } from "effect/unstable/cli"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { RpcSerialization, RpcServer } from "effect/unstable/rpc"
import { createServer } from "node:http"
import os from "node:os"
import { BrowserLauncher, browserSwitches } from "../lib/browser-launcher.ts"
import { PROFILE_TEMPLATE_DIRECTORY, TxConfig } from "../lib/config.ts"
import { Discord } from "../lib/discord.ts"
import { PoolUpstream } from "../lib/pool-upstream.ts"
import { normalizePoolRpcUrl } from "../lib/pool-url.ts"
import { SessionMap } from "../lib/session-map.ts"
import { OperatorRpcHandlers } from "../rpc/operator-handlers.ts"

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
  }, Effect.provide(TxConfig.layer), Effect.scoped),
).pipe(Command.withDescription("Open the existing template profile to refresh login state"))

const templateCommand = Command.make("template").pipe(
  Command.withDescription("Manage the browser profile template"),
  Command.withSubcommands([templateCreateCommand, templateUpdateCommand]),
)

const tiketStartCommand = Command.make(
  "start",
  {
    url: Argument.string("url"),
    customerData: Flag.path("customer-data", { pathType: "file", mustExist: true }).pipe(
      Flag.optional,
      Flag.withDescription("Path to customer data JSON (required unless --server-url)"),
    ),
    serverUrl: Flag.string("server-url").pipe(
      Flag.optional,
      Flag.withDescription("Remote pool server URL (Mode C)"),
    ),
    count: Flag.integer("browser-count").pipe(
      Flag.withAlias("n"),
      Flag.withDescription("Number of browser instances to open"),
      Flag.withDefault(1),
    ),
  },
  Effect.fn(function* ({ count, customerData, serverUrl, url }) {
    const hasCustomerData = Option.isSome(customerData)
    const hasServerUrl = Option.isSome(serverUrl)

    if (hasCustomerData && hasServerUrl) {
      return yield* Effect.die(
        new Error("--customer-data and --server-url are mutually exclusive"),
      )
    }

    if (!hasCustomerData && !hasServerUrl) {
      return yield* Effect.die(
        new Error("--customer-data is required unless --server-url is provided"),
      )
    }

    const poolUpstreamLayer = Option.match(customerData, {
      onSome: (path) => PoolUpstream.localLayer(path),
      onNone: () => PoolUpstream.layer(normalizePoolRpcUrl(Option.getOrThrow(serverUrl))),
    })

    yield* Option.match(customerData, {
      onSome: (path) => Effect.logInfo("Pool upstream local", path),
      onNone: () =>
        Effect.logInfo("Pool upstream", normalizePoolRpcUrl(Option.getOrThrow(serverUrl))),
    })

    return yield* Effect.gen(function* () {
      const server = yield* HttpServer.HttpServer
      const { port } = server.address as HttpServer.TcpAddress
      yield* Effect.logInfo("Operator listening on port", port)

      const browser = yield* BrowserLauncher
      const parallelism = Math.max(1, Math.floor(os.availableParallelism() / 4))
      yield* Effect.all(
        Array.from({ length: count }, () => browser.spawn({ url, port })),
        { concurrency: parallelism },
      )
      return yield* Effect.never
    }).pipe(
      Effect.provide(
        HttpRouter.serve(
          RpcServer.layerHttp({
            group: OperatorRpcs,
            path: "/rpc",
            protocol: "http",
          }).pipe(
            Layer.provide(OperatorRpcHandlers),
            Layer.provideMerge(RpcSerialization.layerNdjson),
            Layer.provide(SessionMap.layer),
            Layer.provide(Discord.layer),
            Layer.provide(TxConfig.layer),
          ),
          { disableLogger: true },
        ).pipe(
          Layer.provideMerge(
            NodeHttpServer.layer(() => createServer(), { host: "127.0.0.1", port: 0 }),
          ),
          Layer.provide(poolUpstreamLayer),
          Layer.provideMerge(BrowserLauncher.layer.pipe(Layer.provide(TxConfig.layer))),
        ),
      ),
      Effect.scoped,
    )
  }, Effect.scoped),
).pipe(Command.withDescription("Start tiket automation and spawn browsers"))

export const tiketCommand = Command.make("tiket").pipe(
  Command.withDescription("Tiket automation"),
  Command.withSubcommands([tiketStartCommand, templateCommand]),
)
