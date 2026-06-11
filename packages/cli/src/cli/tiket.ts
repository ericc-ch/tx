import { NodeHttpServer } from "@effect/platform-node"
import { OperatorRpcs } from "@tx/schema"
import { Console, Duration, Effect, FileSystem, Layer, Option, Path, Terminal } from "effect"
import { Argument, Command, Flag, Prompt } from "effect/unstable/cli"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { RpcSerialization, RpcServer } from "effect/unstable/rpc"
import { createServer } from "node:http"
import { availableParallelism } from "node:os"
import { BrowserLauncher, browserSwitches } from "../lib/browser-launcher.ts"
import { TEMPLATE_PREFIX, templateProfileDirectory, TxConfig } from "../lib/config.ts"
import { Discord } from "../lib/discord.ts"
import { PoolUpstream } from "../lib/pool-upstream.ts"
import { normalizePoolRpcUrl } from "../lib/pool-url.ts"
import { SessionMap } from "../lib/session-map.ts"
import { OperatorRpcHandlers } from "../rpc/operator-handlers.ts"

const defaultSpawnConcurrency = Math.max(1, Math.floor(availableParallelism() / 2))

const templateCreateProfileDirectory = "Draft"
const templateNamePattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/

const validateTemplateName = (name: string) => {
  if (!templateNamePattern.test(name) || name.length > 32) {
    return Effect.die(
      new Error(
        `Invalid template name "${name}": use lowercase letters, digits, and hyphens (max 32 characters)`,
      ),
    )
  }
  return Effect.void
}

const templateNameArgument = Argument.string("name").pipe(
  Argument.withDescription(
    "Template name (lowercase letters, digits, hyphens). Stored at <userDataDir>/__template-<name>.",
  ),
)

const templateCreateCommand = Command.make(
  "create",
  { name: templateNameArgument },
  Effect.fn(
    function* ({ name }) {
      yield* validateTemplateName(name)

      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
      const { config, paths } = yield* TxConfig
      const templateDir = path.join(paths.userDataDir, templateProfileDirectory(name))
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
          message: `Save as template "${name}"?`,
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
    "Open a disposable browser, log into Tiket, and optionally save the profile as a named template at <userDataDir>/__template-<name>. Replaces that template when you confirm save.",
  ),
  Command.withExamples([
    {
      command: "tx tiket template create team-alpha",
      description: "Create or replace the team-alpha login template",
    },
  ]),
)

const templateUpdateCommand = Command.make(
  "update",
  { name: templateNameArgument },
  Effect.fn(
    function* ({ name }) {
      yield* validateTemplateName(name)

      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
      const { config, paths } = yield* TxConfig
      const templateDir = path.join(paths.userDataDir, templateProfileDirectory(name))

      if (!(yield* fs.exists(templateDir))) {
        return yield* Effect.die(
          new Error(
            `Template "${name}" not found at ${templateDir}. Create one with: tx tiket template create ${name}`,
          ),
        )
      }

      const handle = yield* spawner.spawn(
        ChildProcess.make(config.browserExecutable, [
          `--user-data-dir=${paths.userDataDir}`,
          `--profile-directory=${templateProfileDirectory(name)}`,
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
    "Open an existing named template profile so you can refresh Tiket cookies or re-authenticate. Changes are written back when you close the browser.",
  ),
  Command.withExamples([
    {
      command: "tx tiket template update team-alpha",
      description: "Refresh the team-alpha template without recreating it",
    },
  ]),
)

const templateListCommand = Command.make(
  "list",
  {},
  Effect.fn(
    function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const { paths } = yield* TxConfig
      const entries = yield* fs.readDirectory(paths.userDataDir)
      const names: Array<string> = []

      for (const entry of entries) {
        if (!entry.startsWith(TEMPLATE_PREFIX)) continue
        const entryPath = path.join(paths.userDataDir, entry)
        const stat = yield* fs.stat(entryPath)
        if (stat.type === "Directory") {
          names.push(entry.slice(TEMPLATE_PREFIX.length))
        }
      }

      names.sort()
      if (names.length === 0) {
        yield* Effect.logInfo("No templates")
        return
      }

      for (const name of names) {
        yield* Console.log(name)
      }
    },
    Effect.provide(TxConfig.layer),
  ),
).pipe(
  Command.withDescription(
    "List named template profiles in userDataDir (directories matching __template-<name>).",
  ),
  Command.withExamples([
    {
      command: "tx tiket template list",
      description: "Show all saved template names",
    },
  ]),
)

const templateDeleteCommand = Command.make(
  "delete",
  {
    name: templateNameArgument,
    force: Flag.boolean("force").pipe(
      Flag.withAlias("f"),
      Flag.withDefault(false),
      Flag.withDescription("Delete without confirmation."),
    ),
  },
  Effect.fn(
    function* ({ name, force }) {
      yield* validateTemplateName(name)

      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const { paths } = yield* TxConfig
      const templateDir = path.join(paths.userDataDir, templateProfileDirectory(name))

      if (!(yield* fs.exists(templateDir))) {
        return yield* Effect.die(
          new Error(`Template "${name}" not found at ${templateDir}`),
        )
      }

      if (!force) {
        const confirmed = yield* Prompt.run(
          Prompt.confirm({
            message: `Delete template "${name}"?`,
            initial: false,
          }),
        ).pipe(Effect.catchIf(Terminal.isQuitError, () => Effect.succeed(false)))

        if (!confirmed) {
          yield* Effect.logDebug("Template not deleted")
          return
        }
      }

      yield* fs.remove(templateDir, { recursive: true, force: true })
      yield* Effect.logInfo("Template deleted", name)
    },
    Effect.provide(TxConfig.layer),
  ),
).pipe(
  Command.withDescription(
    "Remove a named template profile from userDataDir. Prompts for confirmation unless --force is set.",
  ),
  Command.withExamples([
    {
      command: "tx tiket template delete team-alpha",
      description: "Delete team-alpha after confirmation",
    },
    {
      command: "tx tiket template delete team-alpha --force",
      description: "Delete team-alpha without prompting",
    },
  ]),
)

const templateCommand = Command.make("template").pipe(
  Command.withShortDescription("Browser profile templates"),
  Command.withDescription(
    "Manage named Chromium profile templates under <userDataDir>/__template-<name>. Pass --template to tx tiket start to copy a template into new browser instances.",
  ),
  Command.withSubcommands([
    templateCreateCommand,
    templateUpdateCommand,
    templateListCommand,
    templateDeleteCommand,
  ]),
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
        "How many browser instances to spawn. Each instance claims customers independently from the pool.",
      ),
      Flag.withDefault(1),
      Flag.withMetavar("N"),
    ),
    spawnConcurrency: Flag.integer("spawn-concurrency").pipe(
      Flag.withDescription(
        "How many browsers may boot at once. Each slot is held until the extension signals ready or the ready timeout expires.",
      ),
      Flag.withDefault(defaultSpawnConcurrency),
      Flag.withMetavar("N"),
    ),
    browserReadyTimeout: Flag.integer("browser-ready-timeout").pipe(
      Flag.withDescription(
        "Seconds to wait for each browser to signal ready before killing it and continuing with the next spawn.",
      ),
      Flag.withDefault(90),
      Flag.withMetavar("SECONDS"),
    ),
    template: Flag.string("template").pipe(
      Flag.optional,
      Flag.withDescription(
        "Named login template to copy into each new browser profile (<userDataDir>/__template-<name>). Omitted or missing templates start with fresh profiles.",
      ),
      Flag.withMetavar("NAME"),
    ),
  },
  Effect.fn(function* ({
    count,
    customerData,
    serverUrl,
    template,
    url,
    spawnConcurrency,
    browserReadyTimeout,
  }) {
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

    const templateName = Option.getOrUndefined(template)
    if (templateName !== undefined) {
      yield* validateTemplateName(templateName)
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
      const readyTimeout = Duration.seconds(browserReadyTimeout)
      let ready = 0

      yield* Effect.forEach(
        Array.from({ length: count }),
        () =>
          browser
            .spawn({
              url,
              port,
              readyTimeout,
              ...(templateName === undefined ? {} : { template: templateName }),
            })
            .pipe(
              Effect.tap((id) => {
                ready++
                return Effect.logDebug(`Browser ready ${ready}/${count}`, id)
              }),
              Effect.catchTag("BrowserReadyTimeout", (error) =>
                Effect.logWarning("Browser killed — ready timeout", error.browserId),
              ),
            ),
        { concurrency: Math.max(1, spawnConcurrency), discard: true },
      )

      if (ready === 0) {
        return yield* Effect.die(new Error("No browsers became ready"))
      }

      yield* Effect.logInfo(`${ready}/${count} browsers ready`)
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
    {
      command:
        'tx tiket start --customer-data ./customers.json --template team-alpha -n 5 "https://www.tiket.com/to-do/my-event"',
      description: "Five browsers using the team-alpha login template",
    },
  ]),
)

export const tiketCommand = Command.make("tiket").pipe(
  Command.withShortDescription("Tiket.com automation"),
  Command.withDescription(
    "Commands for running Tiket checkout automation in real browsers. The extension handles package selection, order forms, and payment; the CLI spawns browsers and coordinates customer claims.",
  ),
  Command.withSubcommands([tiketStartCommand, templateCommand]),
)
