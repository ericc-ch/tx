import { Context, Duration } from "effect"

export class PoolConfig extends Context.Service<
  PoolConfig,
  {
    readonly customerDataPath: string
    readonly claimTtl: Duration.Duration
  }
>()("@tx/pool/PoolConfig") {}
