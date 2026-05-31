import { describe, expect, it } from "@effect/vitest"
import {
  overviewUrl,
  packagesUrl,
  pageKind,
} from "../src/entrypoints/tiket-autobuy.content/routing"

const base = "/id-id/to-do/lany-soft-world-tour-in-jakarta-2026-29-oct-gos"
const search = "?utm_page=toDoDetail"

describe("tiket url", () => {
  it("classifies overview, packages, and order paths", () => {
    expect(pageKind({ pathname: base })).toBe("overview")
    expect(pageKind({ pathname: `${base}/` })).toBe("overview")
    expect(pageKind({ pathname: `${base}/packages` })).toBe("packages")
    expect(pageKind({ pathname: `${base}/packages/` })).toBe("packages")
    expect(pageKind({ pathname: `${base}/order` })).toBe("order")
    expect(pageKind({ pathname: "/other/path" })).toBe("unknown")
  })

  it("builds overview and packages urls preserving query", () => {
    expect(overviewUrl({ pathname: `${base}/packages`, search })).toBe(`${base}${search}`)
    expect(overviewUrl({ pathname: `${base}/order`, search })).toBe(`${base}${search}`)
    expect(overviewUrl({ pathname: base, search })).toBeNull()

    expect(packagesUrl({ pathname: base, search })).toBe(`${base}/packages${search}`)
    expect(packagesUrl({ pathname: `${base}/packages`, search })).toBeNull()
  })
})
