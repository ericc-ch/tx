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
    customerData: Flag.string("customer-data").pipe(
      Flag.withDescription("Path to customer JSON data file"),
    ),
    host: Flag.string("host").pipe(
      Flag.withDescription("Host to bind"),
      Flag.withDefault("0.0.0.0"),
    ),
    port: Flag.integer("port").pipe(
      Flag.withDescription("Port to bind (0 = ephemeral)"),
      Flag.withDefault(0),
    ),
    claimTtlSeconds: Flag.integer("claim-ttl-seconds").pipe(
      Flag.withDescription("Seconds before an in-flight claim returns to the pool"),
      Flag.withDefault(1800),
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
).pipe(Command.withDescription("Start the customer pool RPC server"))

if (import.meta.main) {
  const command = Command.make("pool-server").pipe(
    Command.withSubcommands([poolStartCommand, poolCsvToJsonCommand]),
  )
  const cli = Command.run(command, { version: packageJson.version })
  NodeRuntime.runMain(cli.pipe(Effect.provide(NodeServices.layer)))
}
