import { beforeEach, describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { readPeopleAhead } from "../src/entrypoints/tiket-queue.content/parse"
import { loadFixture, NodePlatform, resetDom } from "./util"

describe("readPeopleAhead", () => {
  it.layer(NodePlatform)((it) => {
    it.effect("reads from the queue fixture", () =>
      Effect.gen(function* () {
        yield* loadFixture("../../../fixtures/the-weeknd-queue.html")
        expect(readPeopleAhead().peopleAhead).toBe(12135)
      }))
  })

  describe("inline DOM", () => {
    beforeEach(resetDom)

    it("returns undefined when the element is missing", () => {
      expect(readPeopleAhead().peopleAhead).toBeUndefined()
    })

    it("returns undefined while the counter is empty", () => {
      document.body.innerHTML =
        '<span id="MainPart_lbUsersInLineAheadOfYou"></span>'
      expect(readPeopleAhead().peopleAhead).toBeUndefined()
    })

    it("returns undefined for non-numeric text", () => {
      document.body.innerHTML =
        '<span id="MainPart_lbUsersInLineAheadOfYou">…</span>'
      expect(readPeopleAhead().peopleAhead).toBeUndefined()
    })

    it("returns undefined while the counter is hidden", () => {
      document.body.innerHTML =
        '<span id="MainPart_lbUsersInLineAheadOfYou" style="display:none">34066</span>'
      expect(readPeopleAhead().peopleAhead).toBeUndefined()
    })

    it("parses comma-separated numbers", () => {
      document.body.innerHTML =
        '<span id="MainPart_lbUsersInLineAheadOfYou">1,234</span>'
      expect(readPeopleAhead().peopleAhead).toBe(1234)
    })

    it("parses dot-separated numbers from the custom queue section", () => {
      document.body.innerHTML = `
        <div id="CustomQueueSection_NumberOfPeopleAhead">
          <span>12.135</span>
          <div>people in front of you</div>
        </div>`
      expect(readPeopleAhead().peopleAhead).toBe(12135)
    })

    it("prefers the custom queue section over the default counter", () => {
      document.body.innerHTML = `
        <div id="CustomQueueSection_NumberOfPeopleAhead">
          <span>12.135</span>
        </div>
        <span id="MainPart_lbUsersInLineAheadOfYou">99999</span>`
      expect(readPeopleAhead().peopleAhead).toBe(12135)
    })
  })
})
