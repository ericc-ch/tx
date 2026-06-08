import readmePath from "../../../../README.md" with { type: "file" }
import { readFile } from "node:fs/promises"
import { Console, Effect } from "effect"
import { Command } from "effect/unstable/cli"

export const readmeCommand = Command.make(
  "readme",
  {},
  Effect.fn(function* () {
    const text = yield* Effect.promise(() => readFile(readmePath, "utf-8"))
    yield* Console.log(text)
  }),
).pipe(
  Command.withDescription("Print the tx user guide (README)."),
  Command.withExamples([
    {
      command: "tx readme",
      description: "Show installation, configuration, and command reference",
    },
    {
      command: "tx readme | less -R",
      description: "Scroll through the guide in a pager",
    },
  ]),
)
