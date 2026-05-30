import { NodeFileSystem, NodePath } from "@effect/platform-node"
import { describe, expect, it } from "@effect/vitest"
import { Effect, FileSystem, Layer, Path } from "effect"
import { CustomerPool } from "../src/lib/customer-pool.ts"

const NodePlatform = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)

const sampleCustomers = [
  {
    name: "Tono Tenda",
    email: "tonotenda@example.com",
    birthDate: "7/13/2003",
    gender: "Female",
    nik: "3122022302230022",
    phone: "082259225223",
    categories: ["cat 1", "festival"],
    ticketCount: 1,
    day: "Day 1",
    membershipCode: "BA203480222",
    paymentMethod: "BCA",
  },
  {
    name: "Tronton Tuntu",
    email: "tronton@gmail.com",
    birthDate: "1/4/2001",
    gender: "Female",
    nik: "3207042201110044",
    phone: "085122005833",
    categories: ["festival"],
    ticketCount: 2,
    day: "Day 1",
    membershipCode: "BA767815122",
    paymentMethod: "VA MANDIRI",
  },
  {
    name: "Third Person",
    email: "third@example.com",
    birthDate: "1/1/2000",
    gender: "Male",
    nik: "1111111111111111",
    phone: "081111111111",
    categories: ["cat 6"],
    ticketCount: 3,
    day: "Day 1",
    membershipCode: "CODE3",
    paymentMethod: "BCA",
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
    }).pipe(Effect.provide(CustomerPool.layer({ path: file })), Effect.scoped)
  }).pipe(Effect.provide(NodePlatform), Effect.scoped)

describe("CustomerPool", () => {
  it("claims rows in order without duplicates", () =>
    Effect.gen(function* () {
      const { pool } = yield* withPool(sampleCustomers.slice(0, 2))

      const first = yield* pool.claim()
      const second = yield* pool.claim()
      const third = yield* pool.claim()

      expect(first?.email).toBe("tonotenda@example.com")
      expect(second?.email).toBe("tronton@gmail.com")
      expect(third).toBeNull()
    }))

  it("serializes concurrent claims", () =>
    Effect.gen(function* () {
      const { pool } = yield* withPool(sampleCustomers)

      const claimed = yield* Effect.all(Array.from({ length: 10 }, () => pool.claim()), {
        concurrency: 10,
      })

      const emails = claimed.flatMap((customer) => (customer ? [customer.email] : []))
      expect(emails).toHaveLength(3)
      expect(new Set(emails).size).toBe(3)
    }))

  it("reload appends new rows and ignores claimed keys", () =>
    Effect.gen(function* () {
      const { pool, file, fs } = yield* withPool(sampleCustomers.slice(0, 2))

      const first = yield* pool.claim()
      expect(first?.email).toBe("tonotenda@example.com")

      yield* fs.writeFileString(file, `${JSON.stringify(sampleCustomers, null, 2)}\n`)
      yield* Effect.sleep("500 millis")

      const reloaded = yield* pool.claim()
      const afterReload = yield* pool.claim()

      expect(reloaded?.email).toBe("third@example.com")
      expect(afterReload).toBeNull()
    }))

  it("deduplicates rows already in the available pool on reload", () =>
    Effect.gen(function* () {
      const { pool, file, fs } = yield* withPool(sampleCustomers.slice(0, 2))

      yield* fs.writeFileString(file, `${JSON.stringify(sampleCustomers.slice(0, 2), null, 2)}\n`)
      yield* Effect.sleep("500 millis")

      const first = yield* pool.claim()
      const second = yield* pool.claim()
      const third = yield* pool.claim()

      expect(first?.email).toBe("tonotenda@example.com")
      expect(second?.email).toBe("tronton@gmail.com")
      expect(third).toBeNull()
    }))
})
