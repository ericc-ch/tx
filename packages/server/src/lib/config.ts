import envPaths from "env-paths"
import { Context, Effect, FileSystem, Layer, Path, Predicate, Schema } from "effect"

const CONFIG_FILE_NAME = "config.json"
const paths = envPaths("tx")

const TxConfigSchema = Schema.Struct({
  browserExecutable: Schema.String,
  browserExtensionPath: Schema.String,
  customerDataPath: Schema.String,
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
    const configFilePath = path.join(paths.config, CONFIG_FILE_NAME)
    const userDataDir = path.join(paths.data, "user-data-dir")
    const templateDir = path.join(userDataDir, "template")

    const rawContent = yield* fs.readFileString(configFilePath).pipe(
      Effect.catchTag("PlatformError", (cause) =>
        Predicate.isTagged(cause.reason, "NotFound")
          ? Effect.gen(function* () {
              yield* fs.makeDirectory(paths.config, { recursive: true })
              const content = `${JSON.stringify(defaultConfig, null, 2)}\n`
              yield* fs.writeFileString(configFilePath, content)
              yield* Effect.logInfo("Created default config at", configFilePath)
              return content
            })
          : Effect.fail(cause),
      ),
    )

    const config = yield* Schema.decodeUnknownEffect(TxConfigFile)(rawContent).pipe(Effect.orDie)
    yield* fs.makeDirectory(userDataDir, { recursive: true })

    return {
      config,
      paths: {
        configFilePath,
        userDataDir,
        templateDir,
      },
    }
  }),
}) {
  static layer = Layer.effect(this, this.make())
}
