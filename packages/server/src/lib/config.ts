import envPaths from "env-paths"
import { Context, Effect, FileSystem, Layer, Path, Predicate, Schema } from "effect"

const CONFIG_FILE_NAME = "config.json"
export const PROFILE_TEMPLATE_DIRECTORY = "__profile-template"
const txEnvPaths = envPaths("tx")

export const TxConfigSchema = Schema.Struct({
  browserExecutable: Schema.String,
  browserExtensionPath: Schema.String,
  customerDataPath: Schema.String,
  userDataDir: Schema.optional(Schema.NonEmptyString),
  copyUserDataDirToTmp: Schema.optional(Schema.Boolean),
  discordWebhookUrl: Schema.optional(Schema.String),
  $schema: Schema.optional(Schema.String),
})

const TxConfigFile = Schema.fromJsonString(TxConfigSchema)

const defaultConfig = {
  browserExecutable: "helium",
  browserExtensionPath: "",
  customerDataPath: "",
} satisfies typeof TxConfigSchema.Type

export class TxConfig extends Context.Service<TxConfig>()("@tx/server/TxConfig", {
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

    return { config, paths }
  }),
}) {
  static layer = Layer.effect(this, this.make())
}
