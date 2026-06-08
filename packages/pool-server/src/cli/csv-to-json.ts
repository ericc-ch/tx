import { NodeFileSystem, NodePath } from "@effect/platform-node"
import { Console, Effect, FileSystem, Layer, Option, Path } from "effect"
import { Argument, Command } from "effect/unstable/cli"
import { customersFromCsv } from "../lib/csv-to-json.ts"

const NodePlatform = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)

export const poolCsvToJsonCommand = Command.make(
  "csv-to-json",
  {
    input: Argument.string("input").pipe(Argument.withDescription("Path to input CSV file")),
    output: Argument.string("output").pipe(
      Argument.optional,
      Argument.withDescription("Path to output JSON file (defaults to input basename with .json)"),
    ),
  },
  Effect.fn(function* ({ input, output }) {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path

    const outputFile = Option.match(output, {
      onSome: (file) => file,
      onNone: () =>
        path.join(
          path.dirname(input),
          `${path.basename(input, path.extname(input))}.json`,
        ),
    })

    const customers = customersFromCsv(yield* fs.readFileString(input))
    yield* fs.writeFileString(outputFile, `${JSON.stringify(customers, null, 2)}\n`)
    yield* Console.log(`Wrote ${customers.length} customers to ${outputFile}`)
  }, Effect.provide(NodePlatform)),
).pipe(Command.withDescription("Convert customer CSV to JSON"))
