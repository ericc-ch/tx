import { describe, expect, it } from "@effect/vitest"
import { overviewUrl, packagesUrl, pageKind } from "../src/entrypoints/tiket-autobuy.content/url"

const base =
  "/id-id/to-do/lany-soft-world-tour-in-jakarta-2026-29-oct-gos"
const search = "?utm_page=toDoDetail"

describe("tiket url", () => {
  it("classifies overview, packages, and order paths", () => {
    expect(pageKind(base)).toBe("overview")
    expect(pageKind(`${base}/`)).toBe("overview")
    expect(pageKind(`${base}/packages`)).toBe("packages")
    expect(pageKind(`${base}/packages/`)).toBe("packages")
    expect(pageKind(`${base}/order`)).toBe("order")
    expect(pageKind("/other/path")).toBe("unknown")
  })

  it("builds overview and packages urls preserving query", () => {
    expect(overviewUrl(`${base}/packages`, search)).toBe(`${base}${search}`)
    expect(overviewUrl(`${base}/order`, search)).toBe(`${base}${search}`)
    expect(overviewUrl(base, search)).toBeNull()

    expect(packagesUrl(base, search)).toBe(`${base}/packages${search}`)
    expect(packagesUrl(`${base}/packages`, search)).toBeNull()
  })
})
