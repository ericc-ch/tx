import { readmeContent } from "../macros/readme.ts" with { type: "macro" }
import { Console, Effect } from "effect"
import { Command } from "effect/unstable/cli"

const readmeText = readmeContent()

export const readmeCommand = Command.make(
  "readme",
  {},
  Effect.fn(function* () {
    yield* Console.log(readmeText)
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
