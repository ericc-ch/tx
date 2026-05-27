import { beforeEach, describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { readPeopleAhead } from "../src/entrypoints/tiket-queue.content/parse"
import { resetDom } from "./util"

describe("readPeopleAhead", () => {
  beforeEach(resetDom)

  it("returns undefined when the element is missing", async () => {
    expect((await Effect.runPromise(readPeopleAhead())).peopleAhead).toBeUndefined()
  })

  it("returns undefined while the counter is empty", async () => {
    document.body.innerHTML = '<span id="MainPart_lbUsersInLineAheadOfYou"></span>'
    expect((await Effect.runPromise(readPeopleAhead())).peopleAhead).toBeUndefined()
  })

  it("returns undefined for non-numeric text", async () => {
    document.body.innerHTML = '<span id="MainPart_lbUsersInLineAheadOfYou">…</span>'
    expect((await Effect.runPromise(readPeopleAhead())).peopleAhead).toBeUndefined()
  })

  it("returns undefined while the counter is hidden", async () => {
    document.body.innerHTML =
      '<span id="MainPart_lbUsersInLineAheadOfYou" style="display:none">34066</span>'
    expect((await Effect.runPromise(readPeopleAhead())).peopleAhead).toBeUndefined()
  })
})
