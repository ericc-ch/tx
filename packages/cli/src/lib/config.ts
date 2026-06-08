import envPaths from "env-paths"
import { Context, Effect, FileSystem, Layer, Path, Predicate, Schema } from "effect"
const CONFIG_FILE_NAME = "config.json"
export const PROFILE_TEMPLATE_DIRECTORY = "__profile-template"
const txEnvPaths = envPaths("tx")

export const TxConfigSchema = Schema.Struct({
  browserExecutable: Schema.String.annotateKey({
    description:
      "Command name or absolute path of the Chromium-based browser binary. Passed to every spawned instance via ChildProcess. Defaults to helium.",
  }),
  userDataDir: Schema.optional(Schema.NonEmptyString).annotateKey({
    description:
      "Chromium user-data root (--user-data-dir). Each browser gets a subdirectory profile here; the shared login template lives at <userDataDir>/__profile-template. Relative paths resolve from the config file directory. Defaults to the app data directory.",
  }),
  copyUserDataDirToTmp: Schema.optional(Schema.Boolean).annotateKey({
    description:
      "When true, copies userDataDir to a temp directory at startup so the configured directory is not modified. Each run starts from a snapshot.",
  }),
  $schema: Schema.optional(Schema.String).annotateKey({
    description: "Optional JSON Schema URL for editor validation hints (e.g. in VS Code).",
  }),
}).annotate({
  description: "tx CLI configuration persisted at config.json (see tx debug paths).",
})

const TxConfigFile = Schema.fromJsonString(TxConfigSchema)

const defaultConfig = {
  browserExecutable: "helium",
} satisfies typeof TxConfigSchema.Type

export class TxConfig extends Context.Service<TxConfig>()("@tx/cli/TxConfig", {
  make: Effect.fn(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const configFilePath = path.join(txEnvPaths.config, CONFIG_FILE_NAME)

    const rawContent = yield* fs.readFileString(configFilePath).pipe(
      Effect.catchTag("PlatformError", (cause) =>
        Predicate.isTagged(cause.reason, "NotFound")
          ? Effect.gen(function* () {
              yield* fs.makeDirectory(txEnvPaths.config, { recursive: true })
              const content = `${JSON.stringify(defaultConfig, null, 2)}\n`
              yield* fs.writeFileString(configFilePath, content)
              yield* Effect.logInfo("Created default config at", configFilePath)
              return content
            })
          : Effect.fail(cause),
      ),
    )

    const config = yield* Schema.decodeUnknownEffect(TxConfigFile)(rawContent).pipe(Effect.orDie)

    const defaultUserDataDir = path.join(txEnvPaths.data, "user-data-dir")
    let userDataDir = defaultUserDataDir
    if (config.userDataDir !== undefined) {
      if (path.isAbsolute(config.userDataDir)) {
        userDataDir = config.userDataDir
      } else {
        userDataDir = path.resolve(path.dirname(configFilePath), config.userDataDir)
      }
    }

    const paths = {
      env: txEnvPaths,
      configFilePath,
      userDataDir,
      templateDir: path.join(userDataDir, PROFILE_TEMPLATE_DIRECTORY),
    }

    yield* fs.makeDirectory(paths.userDataDir, { recursive: true })

    // Development: `bun run dev` loads packages/cli/.env.dev into process.env.
    // Production: scripts/build.ts bakes DISCORD_WEBHOOK_URL into the compiled binary.
    const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL?.trim()
    if (!discordWebhookUrl) {
      return yield* Effect.die(
        new Error(
          "DISCORD_WEBHOOK_URL is not set — use `bun run dev` (loads .env.dev) or a production build",
        ),
      )
    }

    return { config, paths, discordWebhookUrl }
  }),
}) {
  static layer = Layer.effect(this, this.make())
}
