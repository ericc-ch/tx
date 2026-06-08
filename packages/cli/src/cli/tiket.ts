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
    "Open a disposable browser, log into Tiket, and optionally save the profile as the shared template at <userDataDir>/__profile-template. Replaces any existing template when you confirm save.",
  ),
  Command.withExamples([
    {
      command: "tx tiket template create",
      description: "Create or replace the shared login template",
    },
  ]),
)

const templateUpdateCommand = Command.make(
  "update",
  {},
  Effect.fn(
    function* () {
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
    },
    Effect.provide(TxConfig.layer),
    Effect.scoped,
  ),
).pipe(
  Command.withDescription(
    "Open the existing template profile in your configured userDataDir so you can refresh Tiket cookies or re-authenticate. Changes are written back to __profile-template when you close the browser.",
  ),
  Command.withExamples([
    {
      command: "tx tiket template update",
      description: "Refresh an existing template without recreating it",
    },
  ]),
)

const templateCommand = Command.make("template").pipe(
  Command.withShortDescription("Browser profile template"),
  Command.withDescription(
    "Manage the Chromium profile template copied into every new browser started by tx tiket start. Use a template to share one Tiket login across many parallel browser instances.",
  ),
  Command.withSubcommands([templateCreateCommand, templateUpdateCommand]),
)

const tiketStartCommand = Command.make(
  "start",
  {
    url: Argument.string("url").pipe(
      Argument.withDescription(
        "Tiket event URL to open in each browser. Usually the event overview page (path contains /to-do/). The extension navigates from overview → packages → order → payment.",
      ),
    ),
    customerData: Flag.path("customer-data", { pathType: "file", mustExist: true }).pipe(
      Flag.optional,
      Flag.withDescription(
        "Path to a customer JSON file. Starts an in-process pool on this machine. Required unless --server-url is set. Mutually exclusive with --server-url.",
      ),
      Flag.withMetavar("FILE"),
    ),
    serverUrl: Flag.string("server-url").pipe(
      Flag.optional,
      Flag.withDescription(
        "Base URL of a remote tx server start pool (e.g. http://192.168.1.10:3847). Operators claim customers over HTTP RPC. /rpc is appended automatically when omitted. Mutually exclusive with --customer-data.",
      ),
      Flag.withMetavar("URL"),
    ),
    count: Flag.integer("browser-count").pipe(
      Flag.withAlias("n"),
      Flag.withDescription(
        "How many browser instances to spawn. Each instance claims customers independently from the pool. Spawn parallelism is capped at roughly one quarter of available CPU cores.",
      ),
      Flag.withDefault(1),
      Flag.withMetavar("N"),
    ),
  },
  Effect.fn(function* ({ count, customerData, serverUrl, url }) {
    const hasCustomerData = Option.isSome(customerData)
    const hasServerUrl = Option.isSome(serverUrl)

    if (hasCustomerData && hasServerUrl) {
      return yield* Effect.die(new Error("--customer-data and --server-url are mutually exclusive"))
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
).pipe(
  Command.withDescription(
    "Start the operator RPC server on localhost, then spawn one or more browsers with the tx extension loaded. Each browser opens the event URL and runs the autobuy pipeline: claim a customer, fill checkout forms, select payment, and notify Discord on confirmation. Runs until you stop the process (Ctrl+C).",
  ),
  Command.withExamples([
    {
      command:
        'tx tiket start --customer-data ./customers.json "https://www.tiket.com/to-do/my-event"',
      description: "Single browser with a local customer file",
    },
    {
      command:
        'tx tiket start --customer-data ./customers.json -n 5 "https://www.tiket.com/to-do/my-event"',
      description: "Five parallel browsers sharing one local pool",
    },
    {
      command:
        'tx tiket start --server-url http://10.0.0.5:3847 -n 10 "https://www.tiket.com/to-do/my-event"',
      description: "Ten browsers connected to a remote pool server",
    },
    {
      command:
        'tx tiket start --customer-data ./customers.json --log-level debug "https://www.tiket.com/to-do/my-event"',
      description: "Verbose logging from CLI and extension",
    },
  ]),
)

export const tiketCommand = Command.make("tiket").pipe(
  Command.withShortDescription("Tiket.com automation"),
  Command.withDescription(
    "Commands for running Tiket checkout automation in real browsers. The extension handles queue pages, package selection, order forms, and payment; the CLI spawns browsers and coordinates customer claims.",
  ),
  Command.withSubcommands([tiketStartCommand, templateCommand]),
)
