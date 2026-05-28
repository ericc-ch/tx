import { beforeEach, describe, expect, it } from "@effect/vitest"
import { Duration, Effect } from "effect"
import { LocatorTimeout, NotInteractable, Page, StrictModeViolation } from "../src/lib/playwlite"
import { resetDom } from "./util"

// Adapted from Playwright's locator/action tests for the subset implemented here.

describe("Playwlite", () => {
  let hitTarget: Element | null

  beforeEach(() => {
    resetDom()
    hitTarget = null
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => hitTarget,
    })
    Element.prototype.scrollIntoView = () => {}
  })

  const page = () => new Page(document)

  const setContent = (html: string) => {
    document.body.innerHTML = html
  }

  const makeVisible = (...selectors: ReadonlyArray<string>) => {
    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        Object.defineProperty(element, "getBoundingClientRect", {
          configurable: true,
          value: () => ({
            x: 0,
            y: 0,
            left: 0,
            top: 0,
            right: 10,
            bottom: 10,
            width: 10,
            height: 10,
            toJSON: () => ({}),
          }),
        })
      }
    }
  }

  const makeActionable = (selector: string) => {
    makeVisible(selector)
    hitTarget = document.querySelector(selector)
    return hitTarget
  }

  describe("locators", () => {
    it("respects first, last, and nth", async () => {
      setContent(`
        <section>
          <div><p>A</p></div>
          <div><p>A</p><p>A</p></div>
          <div><p>A</p><p>A</p><p>A</p></div>
        </section>
      `)

      expect(await Effect.runPromise(page().locator("div").locator("p").count())).toBe(6)
      expect(await Effect.runPromise(page().locator("div").first().locator("p").count())).toBe(1)
      expect(await Effect.runPromise(page().locator("div").last().locator("p").count())).toBe(3)
      expect(await Effect.runPromise(page().locator("div").nth(1).locator("p").count())).toBe(2)
    })

    it("filters by text and regex", async () => {
      setContent(`<div>Foobar</div><div>Bar</div><div>Hello "world"</div>`)

      expect(await Effect.runPromise(page().locator("div", { hasText: "Foo" }).textContent())).toBe(
        "Foobar",
      )
      expect(
        await Effect.runPromise(
          page()
            .locator("div", { hasText: /Hello "world"/ })
            .textContent(),
        ),
      ).toBe('Hello "world"')
    })

    it("supports Playwright-style read conveniences", async () => {
      setContent(`
        <section id="outer" name="value"><div id="inner">Text,\nmore text</div></section>
        <input id="input" value="input value">
        <textarea id="textarea">text value</textarea>
        <select id="select"><option value="foo" selected>Foo</option></select>
      `)
      Object.defineProperty(document.querySelector("#inner"), "innerText", {
        configurable: true,
        value: "Text, more text",
      })

      expect(await Effect.runPromise(page().locator("#outer").getAttribute("name"))).toBe("value")
      expect(await Effect.runPromise(page().locator("#outer").getAttribute("missing"))).toBeNull()
      expect(await Effect.runPromise(page().getAttribute("#outer", "name"))).toBe("value")
      expect(await Effect.runPromise(page().locator("#inner").textContent())).toBe(
        "Text,\nmore text",
      )
      expect(await Effect.runPromise(page().textContent("#inner"))).toBe("Text,\nmore text")
      expect(await Effect.runPromise(page().locator("#inner").innerText())).toBe("Text, more text")
      expect(await Effect.runPromise(page().innerText("#inner"))).toBe("Text, more text")
      expect(await Effect.runPromise(page().locator("#input").inputValue())).toBe("input value")
      expect(await Effect.runPromise(page().inputValue("#textarea"))).toBe("text value")
      expect(await Effect.runPromise(page().inputValue("#select"))).toBe("foo")
    })

    it("rejects Playwright-style read conveniences on wrong elements", async () => {
      setContent(`<svg>text</svg><div id="inner">Text</div>`)

      await expect(Effect.runPromise(page().locator("svg").innerText())).rejects.toMatchObject({
        _tag: "NotInteractable",
        reason: "wrong-element",
      })
      await expect(Effect.runPromise(page().inputValue("#inner"))).rejects.toMatchObject({
        _tag: "NotInteractable",
        reason: "wrong-element",
      })
    })

    it("throws on strict mode violations", async () => {
      setContent(`<div>A</div><div>B</div>`)

      await expect(Effect.runPromise(page().locator("div").isVisible())).rejects.toBeInstanceOf(
        StrictModeViolation,
      )
      await expect(Effect.runPromise(page().locator("div").textContent())).rejects.toMatchObject({
        _tag: "StrictModeViolation",
        count: 2,
      })
    })

    it("scopes chained locators to the matched roots", async () => {
      setContent(`
        <section>
          <article data-testid="first"><button>Buy</button></article>
          <article data-testid="second"><button>Buy</button><button>Cancel</button></article>
        </section>
      `)

      expect(
        await Effect.runPromise(
          page().getByTestId("first").getByRole("button", { includeHidden: true }).count(),
        ),
      ).toBe(1)
      expect(
        await Effect.runPromise(page().getByTestId("second").getByText("Cancel").count()),
      ).toBe(1)
    })
  })

  describe("getBy selectors", () => {
    it("finds by test id", async () => {
      setContent(`<div><div data-testid="Hello">Hello world</div></div>`)

      expect(await Effect.runPromise(page().getByTestId("Hello").textContent())).toBe("Hello world")
      expect(
        await Effect.runPromise(
          page()
            .locator("div")
            .getByTestId(/He[l]*o/)
            .textContent(),
        ),
      ).toBe("Hello world")
    })

    it("finds by normalized text", async () => {
      setContent(`<div>yo</div><div>ya</div><div>\nye  </div>`)

      expect(await Effect.runPromise(page().getByText("ye").textContent())).toBe("\nye  ")
      expect(await Effect.runPromise(page().getByText(/e/).textContent())).toBe("\nye  ")

      setContent(`<div> ye </div><div>ye</div>`)
      expect(
        await Effect.runPromise(page().getByText("ye", { exact: true }).first().textContent()),
      ).toBe(" ye ")
    })

    it("finds form controls by native label", async () => {
      setContent(
        `<label for="target">Last <span>Name</span></label><input id="target" type="text">`,
      )

      expect(await Effect.runPromise(page().getByLabel("last name").count())).toBe(1)
      expect(
        await Effect.runPromise(
          page()
            .getByLabel(/Last\s+name/i)
            .count(),
        ),
      ).toBe(1)
      expect(await Effect.runPromise(page().locator("body").getByLabel("Name").count())).toBe(1)
    })

    it("finds inputs by placeholder", async () => {
      setContent(`
        <div>
          <input placeholder="Hello">
          <textarea placeholder="Hello World"></textarea>
        </div>
      `)

      expect(await Effect.runPromise(page().getByPlaceholder("hello").count())).toBe(2)
      expect(
        await Effect.runPromise(page().getByPlaceholder("Hello", { exact: true }).count()),
      ).toBe(1)
      expect(await Effect.runPromise(page().locator("div").getByPlaceholder(/wor/i).count())).toBe(
        1,
      )
    })

    it("finds by role and accessible name", async () => {
      setContent(`
        <button>Submit order</button>
        <button disabled>Cancel order</button>
        <h2>Checkout</h2>
        <input type="checkbox" checked aria-label="Terms">
      `)
      makeVisible("button", "h2", "input")

      expect(await Effect.runPromise(page().getByRole("button", { name: "submit" }).count())).toBe(
        1,
      )
      expect(
        await Effect.runPromise(page().getByRole("button", { disabled: true }).textContent()),
      ).toBe("Cancel order")
      expect(
        await Effect.runPromise(
          page().getByRole("heading", { level: 2, name: "Checkout" }).count(),
        ),
      ).toBe(1)
      expect(
        await Effect.runPromise(
          page().getByRole("checkbox", { checked: true, name: "Terms" }).count(),
        ),
      ).toBe(1)
    })
  })

  describe("state and waiting", () => {
    it("reports visible and hidden states", async () => {
      setContent(`<div>Hi</div><span></span><button style="display:none">Hidden</button>`)
      makeVisible("div")

      expect(await Effect.runPromise(page().locator("div").isVisible())).toBe(true)
      expect(await Effect.runPromise(page().locator("div").isHidden())).toBe(false)
      expect(await Effect.runPromise(page().locator("span").isVisible())).toBe(false)
      expect(await Effect.runPromise(page().locator("span").isHidden())).toBe(true)
      expect(await Effect.runPromise(page().locator("no-such-element").isVisible())).toBe(false)
      expect(await Effect.runPromise(page().locator("no-such-element").isHidden())).toBe(true)
      expect(await Effect.runPromise(page().locator("button").isVisible())).toBe(false)
    })

    it("waits for an element to attach", async () => {
      const waiting = Effect.runPromise(
        page()
          .locator("#later")
          .waitFor({
            state: "attached",
            timeout: Duration.millis(250),
          }),
      )

      setTimeout(() => {
        const element = document.createElement("div")
        element.id = "later"
        document.body.append(element)
      }, 10)

      await expect(waiting).resolves.toBeUndefined()
    })

    it("times out while waiting", async () => {
      await expect(
        Effect.runPromise(
          page()
            .locator("#missing")
            .waitFor({ state: "attached", timeout: Duration.millis(30) }),
        ),
      ).rejects.toBeInstanceOf(LocatorTimeout)
    })
  })

  describe("actions", () => {
    it("clicks an actionable element", async () => {
      setContent(`<button>Buy</button>`)
      const button = makeActionable("button")
      let clicked = 0
      button?.addEventListener("click", () => clicked++)

      await Effect.runPromise(page().getByRole("button", { name: "Buy" }).click())

      expect(clicked).toBe(1)
    })

    it("fills inputs and dispatches input/change events", async () => {
      setContent(`<input type="text">`)
      const input = makeActionable("input") as HTMLInputElement
      const events: Array<string> = []
      input.addEventListener("input", (event) => events.push(`${event.type}:${event.composed}`))
      input.addEventListener("change", (event) => events.push(`${event.type}:${event.composed}`))

      await Effect.runPromise(page().locator("input").fill("some value"))

      expect(input.value).toBe("some value")
      expect(events).toEqual(["input:true", "change:false"])
    })

    it("does not mutate input on trial fill", async () => {
      setContent(`<input type="text" value="before">`)
      const input = makeActionable("input") as HTMLInputElement

      await Effect.runPromise(page().locator("input").fill("after", { trial: true }))

      expect(input.value).toBe("before")
    })

    it("checks and unchecks checkbox inputs", async () => {
      setContent(`<input id="checkbox" type="checkbox">`)
      const input = makeActionable("input") as HTMLInputElement

      await Effect.runPromise(page().locator("input").check())
      expect(input.checked).toBe(true)

      await Effect.runPromise(page().locator("input").uncheck())
      expect(input.checked).toBe(false)
    })

    it("rejects check on non checkbox or radio inputs", async () => {
      setContent(`<button>Check me</button>`)
      makeActionable("button")

      await expect(Effect.runPromise(page().locator("button").check())).rejects.toBeInstanceOf(
        NotInteractable,
      )
      await expect(Effect.runPromise(page().locator("button").check())).rejects.toMatchObject({
        _tag: "NotInteractable",
        reason: "wrong-element",
      })
    })

    it("selects options by value, label, index, and multiple attributes", async () => {
      setContent(`
        <select multiple>
          <option value="blue">Blue</option>
          <option value="brown">Brown</option>
          <option value="green">Green</option>
          <option value="gray">Gray</option>
        </select>
      `)
      const select = makeActionable("select") as HTMLSelectElement
      const events: Array<string> = []
      select.addEventListener("input", (event) => events.push(event.type))
      select.addEventListener("change", (event) => events.push(event.type))

      const selected = await Effect.runPromise(
        page()
          .locator("select")
          .selectOption([
            "blue",
            { label: "Green" },
            { index: 3 },
            { value: "brown", label: "Brown" },
          ]),
      )

      expect(selected).toEqual(["blue", "brown", "green", "gray"])
      expect([...select.selectedOptions].map((option) => option.value)).toEqual([
        "blue",
        "brown",
        "green",
        "gray",
      ])
      expect(events).toEqual(["input", "change"])
    })

    it("selects only the first matching option for single selects", async () => {
      setContent(`
        <select>
          <option value="blue">Blue</option>
          <option value="brown">Brown</option>
          <option value="green">Green</option>
        </select>
      `)
      const select = makeActionable("select") as HTMLSelectElement

      const selected = await Effect.runPromise(
        page().locator("select").selectOption(["blue", "green"]),
      )

      expect(selected).toEqual(["blue"])
      expect(select.value).toBe("blue")
    })

    it("dispatches custom events", async () => {
      setContent(`<div></div>`)
      const div = document.querySelector("div")
      let called = false
      div?.addEventListener("ready", () => {
        called = true
      })

      await Effect.runPromise(page().locator("div").dispatchEvent("ready"))

      expect(called).toBe(true)
    })
  })
})
