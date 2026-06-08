import { Console, Effect, Formatter, Schema } from "effect"
import { Command } from "effect/unstable/cli"
import open from "open"
import { TxConfig, TxConfigSchema } from "../lib/config.ts"

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

export const debugCommand = Command.make("debug").pipe(
  Command.withDescription("Debug and introspection"),
  Command.withSubcommands([debugPathsCommand, debugConfigCommand]),
)
