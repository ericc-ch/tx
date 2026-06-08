#!/usr/bin/env bun

import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Duration, Effect, Layer } from "effect"
import { Command, Flag } from "effect/unstable/cli"
import packageJson from "../package.json" with { type: "json" }
import { poolCsvToJsonCommand } from "./cli/csv-to-json.ts"
import { PoolConfig } from "./lib/config.ts"
import { poolServerLayer } from "./layers.ts"

export { CustomerPool } from "./lib/customer-pool.ts"
export { PoolConfig } from "./lib/config.ts"
export { poolCsvToJsonCommand } from "./cli/csv-to-json.ts"
export { poolServerLayer } from "./layers.ts"

export const poolStartCommand = Command.make(
  "start",
  {
    customerData: Flag.path("customer-data", { pathType: "file", mustExist: true }).pipe(
      Flag.withDescription(
        "Path to the customer JSON file to load into the pool. Required. The file is watched for changes; new rows are hot-reloaded without duplicating settled or in-flight customers.",
      ),
      Flag.withMetavar("FILE"),
    ),
    host: Flag.string("host").pipe(
      Flag.withDescription(
        "Network interface to bind. Use 0.0.0.0 to accept connections from other machines on the LAN. Operators connect via tx tiket start --server-url.",
      ),
      Flag.withDefault("0.0.0.0"),
      Flag.withMetavar("HOST"),
    ),
    port: Flag.integer("port").pipe(
      Flag.withDescription(
        "TCP port to listen on. Use 0 to let the OS assign an ephemeral port; check startup logs for the actual port to pass to --server-url.",
      ),
      Flag.withDefault(0),
      Flag.withMetavar("PORT"),
    ),
    claimTtlSeconds: Flag.integer("claim-ttl-seconds").pipe(
      Flag.withDescription(
        "Seconds before an in-flight customer claim is released back to the pool if the operator never resolves it (finished or discarded). Default 1800 (30 minutes).",
      ),
      Flag.withDefault(1800),
      Flag.withMetavar("SECONDS"),
    ),
  },
  ({ claimTtlSeconds, customerData, host, port }) =>
    Effect.never.pipe(
      Effect.provide(
        poolServerLayer(host, port).pipe(
          Layer.provide(
            Layer.succeed(PoolConfig, {
              customerDataPath: customerData,
              claimTtl: Duration.seconds(claimTtlSeconds),
            }),
          ),
        ),
      ),
      Effect.scoped,
    ),
).pipe(
  Command.withDescription(
    "Start the customer pool RPC server. Exposes ClaimNext and Resolve over HTTP at /rpc. Runs until stopped (Ctrl+C). Connect operators with tx tiket start --server-url http://<host>:<port>.",
  ),
  Command.withExamples([
    {
      command: "tx server start --customer-data ./customers.json --port 3847",
      description: "Pool server on port 3847, reachable from other machines when host is 0.0.0.0",
    },
    {
      command: "tx server start --customer-data ./customers.json --claim-ttl-seconds 900",
      description: "Return stuck claims to the pool after 15 minutes",
    },
  ]),
)

if (import.meta.main) {
  const command = Command.make("pool-server").pipe(
    Command.withShortDescription("Customer pool RPC server"),
    Command.withDescription(
      "Standalone entrypoint for the customer pool package. Equivalent to tx server when using the full tx binary.",
    ),
    Command.withSubcommands([poolStartCommand, poolCsvToJsonCommand]),
  )
  const cli = Command.run(command, { version: packageJson.version })
  NodeRuntime.runMain(cli.pipe(Effect.provide(NodeServices.layer)))
}
