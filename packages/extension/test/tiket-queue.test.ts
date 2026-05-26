import { beforeEach, describe, expect, it } from "@effect/vitest"
import { readPeopleAhead } from "../src/entrypoints/tiket-queue.content/parse"
import { resetDom } from "./util"

describe("readPeopleAhead", () => {
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
})
