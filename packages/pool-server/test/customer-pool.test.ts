import { NodeFileSystem, NodePath } from "@effect/platform-node"
import { describe, expect, it } from "@effect/vitest"
import { Duration, Effect, FileSystem, Layer, Path } from "effect"
import { customerKey } from "@tx/schema"
import { CustomerPool } from "../src/lib/customer-pool.ts"
import { PoolConfig } from "../src/lib/config.ts"

const NodePlatform = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)

const sampleCustomers = [
  {
    name: "Tono Tenda",
    email: "tonotenda@example.com",
    birthDate: "2003-07-13",
    gender: "female",
    nik: "3122022302230022",
    phone: "82259225223",
    categories: ["cat 1", "festival"],
    ticketCount: 1,
    day: "day 1",
    membershipCode: "BA203480222",
    paymentMethod: "BCA Virtual Account",
  },
  {
    name: "Tronton Tuntu",
    email: "tronton@gmail.com",
    birthDate: "2001-01-04",
    gender: "female",
    nik: "3207042201110044",
    phone: "85122005833",
    categories: ["festival"],
    ticketCount: 2,
    day: "day 1",
    membershipCode: "BA767815122",
    paymentMethod: "Mandiri Virtual Account",
  },
  {
    name: "Third Person",
    email: "third@example.com",
    birthDate: "2000-01-01",
    gender: "male",
    nik: "1111111111111111",
    phone: "81111111111",
    categories: ["cat 6"],
    ticketCount: 3,
    day: "day 1",
    membershipCode: "CODE3",
    paymentMethod: "BCA Virtual Account",
  },
]

const withPool = (
  customers: ReadonlyArray<(typeof sampleCustomers)[number]>,
  options?: { claimTtl?: Duration.Duration },
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const dir = yield* fs.makeTempDirectory({ prefix: "customer-pool-" })
    const file = path.join(dir, "customers.json")
    yield* fs.writeFileString(file, `${JSON.stringify(customers, null, 2)}\n`)

    return yield* Effect.gen(function* () {
      const pool = yield* CustomerPool
      return { pool, file, fs }
    }).pipe(
      Effect.provide(
        CustomerPool.layer.pipe(
          Layer.provide(
            Layer.succeed(PoolConfig, {
              customerDataPath: file,
              claimTtl: options?.claimTtl ?? Duration.minutes(30),
            }),
          ),
        ),
      ),
      Effect.scoped,
    )
  }).pipe(Effect.provide(NodePlatform), Effect.scoped)

describe("CustomerPool", () => {
  it("claims rows in order without duplicates", () =>
    Effect.gen(function* () {
      const { pool } = yield* withPool(sampleCustomers.slice(0, 2))

      const first = yield* pool.claimNext()
      const second = yield* pool.claimNext()
      const third = yield* pool.claimNext()

      expect(first?.email).toBe("tonotenda@example.com")
      expect(second?.email).toBe("tronton@gmail.com")
      expect(third).toBeNull()
    }))

  it("serializes concurrent claims", () =>
    Effect.gen(function* () {
      const { pool } = yield* withPool(sampleCustomers)

      const claimed = yield* Effect.all(
        Array.from({ length: 10 }, () => pool.claimNext()),
        { concurrency: 10 },
      )

      const emails = claimed.flatMap((customer) => (customer ? [customer.email] : []))
      expect(emails).toHaveLength(3)
      expect(new Set(emails).size).toBe(3)
    }))

  it("resolve discarded frees the slot to claim another customer", () =>
    Effect.gen(function* () {
      const { pool } = yield* withPool(sampleCustomers.slice(0, 2))

      const first = yield* pool.claimNext()
      if (!first) throw new Error("expected first customer")

      yield* pool.resolve(customerKey(first), "discarded")

      const next = yield* pool.claimNext()
      expect(next?.email).toBe("tronton@gmail.com")
    }))

  it("returns in-flight customer to pool after claim TTL", () =>
    Effect.gen(function* () {
      const { pool } = yield* withPool(sampleCustomers.slice(0, 1), {
        claimTtl: Duration.millis(200),
      })

      const first = yield* pool.claimNext()
      expect(first?.email).toBe("tonotenda@example.com")
      expect(yield* pool.claimNext()).toBeNull()

      yield* Effect.sleep(Duration.millis(300))

      const reclaimed = yield* pool.claimNext()
      expect(reclaimed?.email).toBe("tonotenda@example.com")
    }))

  it("reload appends new rows and ignores in-flight or settled keys", () =>
    Effect.gen(function* () {
      const { pool, file, fs } = yield* withPool(sampleCustomers.slice(0, 2))

      const first = yield* pool.claimNext()
      expect(first?.email).toBe("tonotenda@example.com")

      yield* fs.writeFileString(file, `${JSON.stringify(sampleCustomers, null, 2)}\n`)
      yield* Effect.sleep(Duration.millis(500))

      const reloaded = yield* pool.claimNext()
      const afterReload = yield* pool.claimNext()

      expect(reloaded?.email).toBe("third@example.com")
      expect(afterReload).toBeNull()
    }))
})
