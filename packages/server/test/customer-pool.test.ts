import { NodeFileSystem, NodePath } from "@effect/platform-node"
import { describe, expect, it } from "@effect/vitest"
import { Effect, FileSystem, Layer, Path } from "effect"
import { CustomerPool } from "../src/lib/customer-pool.ts"

const NodePlatform = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)

const sampleRows = [
  {
    Timestamp: "5/23/2026 12:20:33",
    "Nama Lengkap": "Tono Tenda",
    Email: "tonotenda@example.com",
    "Tanggal Lahir": "7/13/2003",
    Gender: "Female",
    "NIK/KTP": "3122022302230022",
    "Nomor Telepon (contoh: 81234567890)": "082259225223",
    "Kategori Ticket": "cat 1, festival",
    "Jumlah Ticket": "1",
    "Day (contoh: day 1)": "Day 1",
    "Kode Membership (Presale Only)": "BA203480222",
    "Metode Pembayaran": "BCA",
  },
  {
    Timestamp: "5/23/2026 16:08:07",
    "Nama Lengkap": "Tronton Tuntu",
    Email: "tronton@gmail.com",
    "Tanggal Lahir": "1/4/2001",
    Gender: "Female",
    "NIK/KTP": "3207042201110044",
    "Nomor Telepon (contoh: 81234567890)": "085122005833",
    "Kategori Ticket": "festival",
    "Jumlah Ticket": "2",
    "Day (contoh: day 1)": "Day 1",
    "Kode Membership (Presale Only)": "BA767815122",
    "Metode Pembayaran": "VA MANDIRI",
  },
  {
    Timestamp: "5/23/2026 17:00:00",
    "Nama Lengkap": "Third Person",
    Email: "third@example.com",
    "Tanggal Lahir": "1/1/2000",
    Gender: "Male",
    "NIK/KTP": "1111111111111111",
    "Nomor Telepon (contoh: 81234567890)": "081111111111",
    "Kategori Ticket": "cat 6",
    "Jumlah Ticket": "3",
    "Day (contoh: day 1)": "Day 1",
    "Kode Membership (Presale Only)": "CODE3",
    "Metode Pembayaran": "BCA",
  },
]

const withPool = (rows: ReadonlyArray<(typeof sampleRows)[number]>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const dir = yield* fs.makeTempDirectory({ prefix: "customer-pool-" })
    const file = path.join(dir, "customers.json")
    yield* fs.writeFileString(file, `${JSON.stringify(rows, null, 2)}\n`)

    return yield* Effect.gen(function* () {
      const pool = yield* CustomerPool
      return { pool, file, fs }
    }).pipe(Effect.provide(CustomerPool.layer({ path: file })), Effect.scoped)
  }).pipe(Effect.provide(NodePlatform), Effect.scoped)

describe("CustomerPool", () => {
  it("claims rows in order without duplicates", () =>
    Effect.gen(function* () {
      const { pool } = yield* withPool(sampleRows.slice(0, 2))

      const first = yield* pool.claim()
      const second = yield* pool.claim()
      const third = yield* pool.claim()

      expect(first?.email).toBe("tonotenda@example.com")
      expect(second?.email).toBe("tronton@gmail.com")
      expect(third).toBeNull()
    }))

  it("serializes concurrent claims", () =>
    Effect.gen(function* () {
      const { pool } = yield* withPool(sampleRows)

      const claimed = yield* Effect.all(Array.from({ length: 10 }, () => pool.claim()), {
        concurrency: 10,
      })

      const emails = claimed.flatMap((customer) => (customer ? [customer.email] : []))
      expect(emails).toHaveLength(3)
      expect(new Set(emails).size).toBe(3)
    }))

  it("reload appends new rows and ignores claimed keys", () =>
    Effect.gen(function* () {
      const { pool, file, fs } = yield* withPool(sampleRows.slice(0, 2))

      const first = yield* pool.claim()
      expect(first?.email).toBe("tonotenda@example.com")

      yield* fs.writeFileString(file, `${JSON.stringify(sampleRows, null, 2)}\n`)
      yield* Effect.sleep("500 millis")

      const reloaded = yield* pool.claim()
      const afterReload = yield* pool.claim()

      expect(reloaded?.email).toBe("third@example.com")
      expect(afterReload).toBeNull()
    }))

  it("deduplicates rows already in the available pool on reload", () =>
    Effect.gen(function* () {
      const { pool, file, fs } = yield* withPool(sampleRows.slice(0, 2))

      yield* fs.writeFileString(file, `${JSON.stringify(sampleRows.slice(0, 2), null, 2)}\n`)
      yield* Effect.sleep("500 millis")

      const first = yield* pool.claim()
      const second = yield* pool.claim()
      const third = yield* pool.claim()

      expect(first?.email).toBe("tonotenda@example.com")
      expect(second?.email).toBe("tronton@gmail.com")
      expect(third).toBeNull()
    }))
})
