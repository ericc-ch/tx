#!/usr/bin/env bun

import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Effect } from "effect"
import { Command } from "effect/unstable/cli"
import packageJson from "../package.json" with { type: "json" }
import { poolCsvToJsonCommand, poolStartCommand } from "@tx/pool-server"
import { debugCommand } from "./cli/debug.ts"
import { tiketCommand } from "./cli/tiket.ts"

const serverTopCommand = Command.make("server").pipe(
  Command.withDescription("Customer pool RPC server"),
  Command.withSubcommands([poolStartCommand, poolCsvToJsonCommand]),
)

const command = Command.make("tx", {}).pipe(
  Command.withDescription("tx"),
  Command.withSubcommands([tiketCommand, serverTopCommand, debugCommand]),
)

const cli = Command.run(command, { version: packageJson.version })

NodeRuntime.runMain(cli.pipe(Effect.provide(NodeServices.layer)))
