import { NodeFileSystem, NodePath } from "@effect/platform-node"
import { describe, expect, it } from "@effect/vitest"
import { Duration, Effect, FileSystem, Layer, Path } from "effect"
import { customerKey } from "../src/rpc/schema.ts"
import { CustomerPool } from "../src/lib/customer-pool.ts"
import { TxConfig } from "../src/lib/config.ts"

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

const withPool = (customers: ReadonlyArray<(typeof sampleCustomers)[number]>) =>
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
            Layer.succeed(TxConfig, {
              config: {
                browserExecutable: "helium",
                browserExtensionPath: "",
                customerDataPath: file,
              },
              paths: {
                configFilePath: file,
                userDataDir: dir,
                templateDir: path.join(dir, "__profile-template"),
              },
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

      const first = yield* pool.claim("browser-a")
      const second = yield* pool.claim("browser-b")
      const third = yield* pool.claim("browser-c")

      expect(first?.email).toBe("tonotenda@example.com")
      expect(second?.email).toBe("tronton@gmail.com")
      expect(third).toBeNull()
    }))

  it("returns the same customer for repeated claims from one browser", () =>
    Effect.gen(function* () {
      const { pool } = yield* withPool(sampleCustomers.slice(0, 1))

      const first = yield* pool.claim("browser-a")
      const again = yield* pool.claim("browser-a")

      expect(first?.email).toBe("tonotenda@example.com")
      expect(again?.email).toBe("tonotenda@example.com")
    }))

  it("serializes concurrent claims", () =>
    Effect.gen(function* () {
      const { pool } = yield* withPool(sampleCustomers)

      const claimed = yield* Effect.all(
        Array.from({ length: 10 }, (_, index) => pool.claim(`browser-${index}`)),
        { concurrency: 10 },
      )

      const emails = claimed.flatMap((customer) => (customer ? [customer.email] : []))
      expect(emails).toHaveLength(3)
      expect(new Set(emails).size).toBe(3)
    }))

  it("resolve discarded frees the browser to claim another customer", () =>
    Effect.gen(function* () {
      const { pool } = yield* withPool(sampleCustomers.slice(0, 2))

      const first = yield* pool.claim("browser-a")
      if (!first) throw new Error("expected first customer")

      yield* pool.resolve("browser-a", customerKey(first))

      const next = yield* pool.claim("browser-a")
      expect(next?.email).toBe("tronton@gmail.com")
    }))

  it("reload appends new rows and ignores assigned or settled keys", () =>
    Effect.gen(function* () {
      const { pool, file, fs } = yield* withPool(sampleCustomers.slice(0, 2))

      const first = yield* pool.claim("browser-a")
      expect(first?.email).toBe("tonotenda@example.com")

      yield* fs.writeFileString(file, `${JSON.stringify(sampleCustomers, null, 2)}\n`)
      yield* Effect.sleep(Duration.millis(500))

      const reloaded = yield* pool.claim("browser-b")
      const afterReload = yield* pool.claim("browser-c")

      expect(reloaded?.email).toBe("third@example.com")
      expect(afterReload).toBeNull()
    }))
})
