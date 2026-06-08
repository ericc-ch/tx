import { NodeFileSystem, NodePath } from "@effect/platform-node"
import { Console, Effect, FileSystem, Layer, Option, Path } from "effect"
import { Argument, Command } from "effect/unstable/cli"
import { customersFromCsv } from "../lib/csv-to-json.ts"

const NodePlatform = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)

export const poolCsvToJsonCommand = Command.make(
  "csv-to-json",
  {
    input: Argument.string("input").pipe(
      Argument.withDescription(
        "Path to the input CSV file. Expects Indonesian column headers (Nama Lengkap, Email, Tanggal Lahir, etc.). See README or tx debug customer schema for the output shape.",
      ),
    ),
    output: Argument.string("output").pipe(
      Argument.optional,
      Argument.withDescription(
        "Path for the output JSON file. When omitted, writes alongside the input using the same basename with a .json extension.",
      ),
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
).pipe(
  Command.withDescription(
    "Convert a customer spreadsheet CSV into the JSON format used by --customer-data. Normalizes phones, dates, payment method aliases, and duplicate categories.",
  ),
  Command.withExamples([
    {
      command: "tx server csv-to-json customers.csv",
      description: "Write customers.json next to the CSV",
    },
    {
      command: "tx server csv-to-json customers.csv /tmp/customers.json",
      description: "Write to an explicit output path",
    },
  ]),
)
