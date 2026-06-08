import { CustomerPool, PoolConfig } from "@tx/pool-server"
import { PoolRpcs, type ResolvePayload } from "@tx/schema"
import { Context, Duration, Effect, Layer } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { RpcClient, RpcSerialization } from "effect/unstable/rpc"

const defaultClaimTtl = Duration.seconds(1800)

export class PoolUpstream extends Context.Service<PoolUpstream>()("@tx/cli/PoolUpstream", {
  make: Effect.fn(function* () {
    const client = yield* RpcClient.make(PoolRpcs)

    return {
      claimNext: () => client.ClaimNext(),
      resolve: (payload: typeof ResolvePayload.Type) => client.Resolve(payload),
    }
  }),
}) {
  static layer = (rpcUrl: string) =>
    Layer.effect(this, this.make()).pipe(
      Layer.provide(
        RpcClient.layerProtocolHttp({ url: rpcUrl }).pipe(
          Layer.provideMerge(RpcSerialization.layerNdjson),
          Layer.provideMerge(FetchHttpClient.layer),
        ),
      ),
    )

  static localLayer = (customerDataPath: string) =>
    Layer.effect(
      this,
      Effect.gen(function* () {
        const pool = yield* CustomerPool

        return yield* Effect.succeed({
          claimNext: () =>
            Effect.gen(function* () {
              const customer = yield* pool.claimNext()
              if (!customer) return { empty: true as const }
              return { customer }
            }),
          resolve: (payload: typeof ResolvePayload.Type) =>
            pool.resolve(payload.customerKey, payload.outcome).pipe(Effect.asVoid),
        } as unknown as Context.Service.Shape<typeof PoolUpstream>)
      }),
    ).pipe(
      Layer.provide(CustomerPool.layer),
      Layer.provide(
        Layer.succeed(PoolConfig, {
          customerDataPath,
          claimTtl: defaultClaimTtl,
        }),
      ),
    )
}
