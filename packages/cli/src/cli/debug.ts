import { Customer } from "@tx/schema"
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
).pipe(
  Command.withDescription(
    "Print resolved filesystem paths: env-paths roots (config, data, cache, log, temp), config.json location, and userDataDir (named templates live at __template-<name> inside it).",
  ),
  Command.withExamples([
    {
      command: "tx debug paths",
      description: "Show where tx stores config and browser profiles on this machine",
    },
  ]),
)

const debugConfigSchemaCommand = Command.make(
  "schema",
  {},
  Effect.fn(function* () {
    const document = Schema.toJsonSchemaDocument(TxConfigSchema)
    yield* Console.log(Formatter.formatJson(document.schema, { space: 2 }))
  }),
).pipe(
  Command.withDescription(
    "Print the JSON Schema for config.json, including per-field descriptions from the TxConfigSchema source. Useful for editor validation or understanding each setting.",
  ),
)

const debugConfigOpenCommand = Command.make(
  "open",
  {},
  Effect.fn(function* () {
    const { paths } = yield* TxConfig
    yield* Effect.tryPromise(() => open(paths.configFilePath))
  }, Effect.provide(TxConfig.layer)),
).pipe(
  Command.withDescription(
    "Open config.json in the default application for this OS (xdg-open on Linux, open on macOS, start on Windows).",
  ),
)

const debugConfigCommand = Command.make(
  "config",
  {},
  Effect.fn(function* () {
    const { config } = yield* TxConfig
    yield* Console.log(Formatter.formatJson(config, { space: 2 }))
  }, Effect.provide(TxConfig.layer)),
).pipe(
  Command.withShortDescription("config.json helpers"),
  Command.withDescription(
    "Inspect or edit tx CLI configuration. The resolved config is printed as JSON; subcommands expose the schema or open the file directly.",
  ),
  Command.withSubcommands([debugConfigSchemaCommand, debugConfigOpenCommand]),
)

const debugCustomerSchemaCommand = Command.make(
  "schema",
  {},
  Effect.fn(function* () {
    const document = Schema.toJsonSchemaDocument(Schema.Array(Customer))
    yield* Console.log(Formatter.formatJson(document.schema, { space: 2 }))
  }),
).pipe(
  Command.withDescription(
    "Print the JSON Schema for customer data files (--customer-data), including per-field descriptions from the Customer schema. See also: tx server csv-to-json.",
  ),
)

const debugCustomerCommand = Command.make("customer").pipe(
  Command.withShortDescription("Customer data schema"),
  Command.withDescription(
    "Schema helpers for the customer JSON format used by tx tiket start and tx server start.",
  ),
  Command.withSubcommands([debugCustomerSchemaCommand]),
)

export const debugCommand = Command.make("debug").pipe(
  Command.withShortDescription("Debug and introspection"),
  Command.withDescription(
    "Print resolved paths, configuration, and JSON Schemas. Does not start browsers or modify customer data.",
  ),
  Command.withSubcommands([debugPathsCommand, debugConfigCommand, debugCustomerCommand]),
)
