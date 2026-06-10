#!/usr/bin/env bun

import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Effect } from "effect"
import { Command } from "effect/unstable/cli"
import packageJson from "../package.json" with { type: "json" }
import { poolCsvToJsonCommand, poolStartCommand } from "@tx/pool-server"
import { debugCommand } from "./cli/debug.ts"
import { readmeCommand } from "./cli/readme.ts"
import { tiketCommand } from "./cli/tiket.ts"

const serverTopCommand = Command.make("server").pipe(
  Command.withShortDescription("Shared customer pool RPC server"),
  Command.withDescription(
    "Run a standalone pool server that hands out customers to one or more tx tiket start operators. Use this when several machines share a single customer list over the network.",
  ),
  Command.withSubcommands([poolStartCommand, poolCsvToJsonCommand]),
)

const command = Command.make("tx", {}).pipe(
  Command.withShortDescription("Tiket checkout automation"),
  Command.withDescription(
    "Browser automation for tiket.com. Spawns Helium (or another Chromium browser) with the tx extension, coordinates customer claims, and sends Discord alerts on payment confirm. Run tx readme for the full user guide.",
  ),
  Command.withSubcommands([tiketCommand, serverTopCommand, debugCommand, readmeCommand]),
)

const cli = Command.run(command, { version: packageJson.version })

NodeRuntime.runMain(cli.pipe(Effect.provide(NodeServices.layer)))
