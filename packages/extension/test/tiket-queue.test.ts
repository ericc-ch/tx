import { NodeFileSystem, NodePath } from "@effect/platform-node"
import { beforeEach, describe, expect, it } from "@effect/vitest"
import { Effect, FileSystem, Layer, Path } from "effect"
import { readPeopleAhead } from "../src/entrypoints/tiket-queue.content/parse"

const loadHtml = (html: string) => {
  document.body.innerHTML = new DOMParser().parseFromString(html, "text/html").body.innerHTML
}

const NodePlatform = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)

describe("readPeopleAhead", () => {
  it.layer(NodePlatform)((it) => {
    it.effect("reads from the queue fixture", () =>
      Effect.gen(function*() {
        const fs = yield* FileSystem.FileSystem
        const path = yield* Path.Path
        const testFile = yield* path.fromFileUrl(new URL(import.meta.url))
        const queueFixture = path.join(
          path.dirname(testFile),
          "../../../fixtures/the-weeknd-queue.html",
        )
        const html = yield* fs.readFileString(queueFixture)
        loadHtml(html)
        expect(readPeopleAhead()).toEqual({ peopleAhead: 34066 })
      }))
  })

  describe("inline DOM", () => {
    beforeEach(() => {
      document.body.innerHTML = ""
    })

    it("returns undefined when the element is missing", () => {
      expect(readPeopleAhead()).toBeUndefined()
    })

    it("returns undefined while the counter is empty", () => {
      document.body.innerHTML =
        '<span id="MainPart_lbUsersInLineAheadOfYou"></span>'
      expect(readPeopleAhead()).toBeUndefined()
    })

    it("returns undefined for non-numeric text", () => {
      document.body.innerHTML =
        '<span id="MainPart_lbUsersInLineAheadOfYou">…</span>'
      expect(readPeopleAhead()).toBeUndefined()
    })

    it("returns undefined while the counter is hidden", () => {
      document.body.innerHTML =
        '<span id="MainPart_lbUsersInLineAheadOfYou" style="display:none">34066</span>'
      expect(readPeopleAhead()).toBeUndefined()
    })

    it("parses comma-separated numbers", () => {
      document.body.innerHTML =
        '<span id="MainPart_lbUsersInLineAheadOfYou">1,234</span>'
      expect(readPeopleAhead()).toEqual({ peopleAhead: 1234 })
    })
  })
})
