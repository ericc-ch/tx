import envPaths from "env-paths"
import { Context, Effect, FileSystem, Layer, Path, Predicate, Schema } from "effect"

const CONFIG_FILE_NAME = "config.json"
const txEnvPaths = envPaths("tx")

export const TxConfigSchema = Schema.Struct({
  browserExecutable: Schema.String,
  browserExtensionPath: Schema.String,
  customerDataPath: Schema.String,
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
    const userDataDir = path.join(txEnvPaths.data, "user-data-dir")
    const paths = {
      env: txEnvPaths,
      configFilePath: path.join(txEnvPaths.config, CONFIG_FILE_NAME),
      userDataDir,
      templateDir: path.join(userDataDir, "template"),
    }

    const rawContent = yield* fs.readFileString(paths.configFilePath).pipe(
      Effect.catchTag("PlatformError", (cause) =>
        Predicate.isTagged(cause.reason, "NotFound")
          ? Effect.gen(function* () {
              yield* fs.makeDirectory(paths.env.config, { recursive: true })
              const content = `${JSON.stringify(defaultConfig, null, 2)}\n`
              yield* fs.writeFileString(paths.configFilePath, content)
              yield* Effect.logInfo("Created default config at", paths.configFilePath)
              return content
            })
          : Effect.fail(cause),
      ),
    )

    const config = yield* Schema.decodeUnknownEffect(TxConfigFile)(rawContent).pipe(Effect.orDie)
    yield* fs.makeDirectory(paths.userDataDir, { recursive: true })

    return { config, paths }
  }),
}) {
  static layer = Layer.effect(this, this.make())
}
