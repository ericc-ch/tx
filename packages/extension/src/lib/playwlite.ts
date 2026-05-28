import { Data, Duration, Effect, Ref, Schedule } from "effect"

type TextMatcher = string | RegExp

type LocatorOptions = {
  readonly hasText?: TextMatcher
  readonly visible?: boolean
}

type ByRoleOptions = {
  readonly checked?: boolean
  readonly disabled?: boolean
  readonly exact?: boolean
  readonly expanded?: boolean
  readonly includeHidden?: boolean
  readonly level?: number
  readonly name?: TextMatcher
  readonly pressed?: boolean
  readonly selected?: boolean
}

type TextOptions = {
  readonly exact?: boolean
}

type WaitOptions = {
  readonly state?: "attached" | "detached" | "visible" | "hidden"
  readonly timeout?: Duration.Input
}

type ActionOptions = {
  readonly force?: boolean
  readonly timeout?: Duration.Input
  readonly trial?: boolean
}

type SelectOption =
  | string
  | {
      readonly value?: string
      readonly label?: string
      readonly index?: number
    }

const defaultTimeout = Duration.seconds(5)
const pollInterval = Duration.millis(20)

export class LocatorTimeout extends Data.TaggedError("LocatorTimeout")<{
  readonly selector: string
  readonly state: string
  readonly timeout: Duration.Duration
}> {
  override get message() {
    return `Timed out waiting for ${this.selector} to be ${this.state}`
  }
}

export class StrictModeViolation extends Data.TaggedError("StrictModeViolation")<{
  readonly selector: string
  readonly count: number
}> {
  override get message() {
    return `${this.selector} resolved to ${this.count} elements`
  }
}

type NotInteractableReason =
  | "disabled"
  | "hidden"
  | "not-editable"
  | "wrong-element"

export class NotInteractable extends Data.TaggedError("NotInteractable")<{
  readonly selector: string
  readonly reason: NotInteractableReason
}> {
  override get message() {
    return `${this.selector} is not interactable: ${this.reason}`
  }
}

export type PlaywliteError = LocatorTimeout | StrictModeViolation | NotInteractable

type Query = () => Element[]

export class Locator {
  private readonly query: Query
  private readonly selector: string

  constructor(query: Query, selector: string) {
    this.query = query
    this.selector = selector
  }

  locator(selector: string, options?: LocatorOptions) {
    return new Locator(
      () => {
        const elements: Element[] = []
        for (const root of this.query()) {
          elements.push(...root.querySelectorAll(selector))
        }
        return filterElements(unique(elements), options)
      },
      `${this.selector}.locator(${JSON.stringify(selector)})`,
    )
  }

  getByRole(role: string, options: ByRoleOptions = {}) {
    return this.locatorBy(
      () => allDescendants(this.query()).filter((element) => matchesRole(element, role, options)),
      `getByRole(${JSON.stringify(role)})`,
    )
  }

  getByText(text: TextMatcher, options?: TextOptions) {
    return this.locatorBy(
      () =>
        allDescendants(this.query()).filter((element) =>
          matchesElementText(element, text, options),
        ),
      `getByText(${formatMatcher(text)})`,
    )
  }

  getByLabel(text: TextMatcher, options?: TextOptions) {
    return this.locatorBy(
      () => allDescendants(this.query()).filter((element) => matchesLabel(element, text, options)),
      `getByLabel(${formatMatcher(text)})`,
    )
  }

  getByPlaceholder(text: TextMatcher, options?: TextOptions) {
    return this.locatorBy(
      () =>
        allDescendants(this.query()).filter((element) =>
          element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
            ? matchesText(element.placeholder, text, !!options?.exact)
            : false,
        ),
      `getByPlaceholder(${formatMatcher(text)})`,
    )
  }

  getByTestId(testId: TextMatcher) {
    return this.locatorBy(
      () =>
        allDescendants(this.query()).filter((element) =>
          matchesText(element.getAttribute("data-testid") ?? "", testId, true),
        ),
      `getByTestId(${formatMatcher(testId)})`,
    )
  }

  filter(options: LocatorOptions) {
    return new Locator(() => filterElements(this.query(), options), `${this.selector}.filter(...)`)
  }

  first() {
    return new Locator(() => this.query().slice(0, 1), `${this.selector}.first()`)
  }

  last() {
    return new Locator(() => this.query().slice(-1), `${this.selector}.last()`)
  }

  nth(index: number) {
    return new Locator(() => this.query().slice(index, index + 1), `${this.selector}.nth(${index})`)
  }

  count() {
    return Effect.sync(() => this.query().length)
  }

  textContent() {
    return this.resolve().pipe(Effect.map((element) => element.textContent))
  }

  innerText() {
    const selector = this.selector
    return this.resolve().pipe(
      Effect.flatMap((element) =>
        element instanceof HTMLElement
          ? Effect.succeed(element.innerText ?? element.textContent ?? "")
          : Effect.fail(new NotInteractable({ selector, reason: "wrong-element" })),
      ),
    )
  }

  getAttribute(name: string) {
    return this.resolve().pipe(Effect.map((element) => element.getAttribute(name)))
  }

  inputValue() {
    const selector = this.selector
    return this.resolve().pipe(
      Effect.flatMap((element) => {
        if (
          element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement ||
          element instanceof HTMLSelectElement
        ) {
          return Effect.succeed(element.value)
        }
        return Effect.fail(new NotInteractable({ selector, reason: "wrong-element" }))
      }),
    )
  }

  isVisible() {
    return this.queryState("visible")
  }

  isHidden() {
    return this.queryState("hidden")
  }

  isEnabled() {
    return this.queryState("enabled")
  }

  isDisabled() {
    return this.queryState("disabled")
  }

  isEditable() {
    return this.queryState("editable")
  }

  isChecked() {
    return this.queryState("checked")
  }

  waitFor(options: WaitOptions = {}) {
    const state = options.state ?? "visible"
    const query = this.query
    const selector = this.selector
    return waitUntil(
      Effect.gen(function* () {
        const elements = yield* Effect.sync(query)
        if (elements.length > 1) {
          return yield* new StrictModeViolation({ selector, count: elements.length })
        }
        const element = elements[0]
        const matches = (() => {
          switch (state) {
            case "attached":
              return !!element
            case "detached":
              return !element
            case "visible":
              return !!element && isElementVisible(element)
            case "hidden":
              return !element || !isElementVisible(element)
            default:
              return state satisfies never
          }
        })()

        if (!matches) {
          return yield* new LocatorTimeout({
            selector,
            state,
            timeout: toDuration(options.timeout),
          })
        }
      }),
      { selector, state, ...(options.timeout ? { timeout: options.timeout } : {}) },
    )
  }

  click(options: ActionOptions = {}) {
    const actionable = this.actionable(["visible", "enabled"], options)
    return Effect.gen(function* () {
      const element = yield* actionable
      if (options.trial) return
      yield* Effect.sync(() => {
        if (element instanceof HTMLElement) element.click()
        else {
          for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
            element.dispatchEvent(
              new MouseEvent(type, { bubbles: true, cancelable: true, composed: true }),
            )
          }
        }
      })
    })
  }

  fill(value: string, options: ActionOptions = {}) {
    const actionable = this.actionable(["visible", "enabled", "editable"], options)
    const selector = this.selector
    return Effect.gen(function* () {
      const element = yield* actionable
      if (options.trial) return

      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        yield* Effect.sync(() => {
          element.focus()
          const prototype = Object.getPrototypeOf(element) as HTMLInputElement | HTMLTextAreaElement
          const descriptor = Object.getOwnPropertyDescriptor(prototype, "value")
          descriptor?.set?.call(element, value)
          element.dispatchEvent(
            new InputEvent("input", {
              bubbles: true,
              composed: true,
              inputType: "insertText",
              data: value,
            }),
          )
          element.dispatchEvent(new Event("change", { bubbles: true }))
        })
        return
      }

      if (isContentEditable(element)) {
        yield* Effect.sync(() => {
          ;(element as HTMLElement).focus()
          element.textContent = value
          element.dispatchEvent(
            new InputEvent("input", {
              bubbles: true,
              composed: true,
              inputType: "insertText",
              data: value,
            }),
          )
        })
        return
      }

      return yield* new NotInteractable({ selector, reason: "wrong-element" })
    })
  }

  check(options: ActionOptions = {}) {
    return this.setChecked(true, options)
  }

  uncheck(options: ActionOptions = {}) {
    return this.setChecked(false, options)
  }

  setChecked(checked: boolean, options: ActionOptions = {}) {
    const actionable = this.actionable(["visible", "enabled"], options)
    const selector = this.selector
    return Effect.gen(function* () {
      const element = yield* actionable
      if (!(element instanceof HTMLInputElement) || !["checkbox", "radio"].includes(element.type)) {
        return yield* new NotInteractable({ selector, reason: "wrong-element" })
      }
      if (element.checked === checked || options.trial) return
      yield* Effect.sync(() => element.click())
    })
  }

  selectOption(value: SelectOption | ReadonlyArray<SelectOption>, options: ActionOptions = {}) {
    const actionable = this.actionable(["visible", "enabled"], options)
    const selector = this.selector
    return Effect.gen(function* () {
      const element = yield* actionable
      if (!(element instanceof HTMLSelectElement)) {
        return yield* new NotInteractable({ selector, reason: "wrong-element" })
      }
      if (options.trial) return []

      return yield* Effect.sync(() => {
        const values = Array.isArray(value) ? value : [value]
        const matched = [...element.options].filter((option) =>
          values.some((requested) => {
            if (typeof requested === "string") {
              return option.value === requested || option.label === requested
            }
            if (requested.value !== undefined && option.value !== requested.value) return false
            if (requested.label !== undefined && option.label !== requested.label) return false
            if (requested.index !== undefined && option.index !== requested.index) return false
            return true
          }),
        )
        const selected = element.multiple ? matched : matched.slice(0, 1)
        for (const option of element.options) option.selected = selected.includes(option)
        element.dispatchEvent(new Event("input", { bubbles: true }))
        element.dispatchEvent(new Event("change", { bubbles: true }))
        return selected.map((option) => option.value)
      })
    })
  }

  dispatchEvent(type: string, eventInit: EventInit = {}) {
    const resolved = this.resolve()
    return Effect.gen(function* () {
      const element = yield* resolved
      yield* Effect.sync(() => {
        element.dispatchEvent(
          new Event(type, { bubbles: true, cancelable: true, composed: true, ...eventInit }),
        )
      })
    })
  }

  private locatorBy(query: Query, label: string) {
    return new Locator(query, `${this.selector}.${label}`)
  }

  private resolve() {
    const query = this.query
    const selector = this.selector
    return Effect.gen(function* () {
      const elements = yield* Effect.sync(query)
      if (elements.length === 1) return elements[0]!
      if (elements.length > 1) {
        return yield* new StrictModeViolation({ selector, count: elements.length })
      }
      return yield* new LocatorTimeout({
        selector,
        state: "attached",
        timeout: defaultTimeout,
      })
    })
  }

  private actionable(
    checks: ReadonlyArray<"visible" | "enabled" | "editable">,
    options: ActionOptions,
  ) {
    const resolved = this.resolve()
    const selector = this.selector
    return waitUntil(
      Effect.gen(function* () {
        const element = yield* resolved
        if (!options.force) {
          if (checks.includes("visible") && !isElementVisible(element)) {
            return yield* new NotInteractable({ selector, reason: "hidden" })
          }
          if (checks.includes("enabled") && isDisabled(element)) {
            return yield* new NotInteractable({ selector, reason: "disabled" })
          }
          if (checks.includes("editable") && !isEditable(element)) {
            return yield* new NotInteractable({ selector, reason: "not-editable" })
          }
        }
        return element
      }),
      { selector, state: "actionable", ...(options.timeout ? { timeout: options.timeout } : {}) },
    )
  }

  private queryState(
    state: "visible" | "hidden" | "enabled" | "disabled" | "editable" | "checked",
  ) {
    const query = this.query
    const selector = this.selector
    return Effect.gen(function* () {
      const elements = yield* Effect.sync(query)
      if (elements.length === 0) return state === "hidden"
      if (elements.length > 1) {
        return yield* new StrictModeViolation({ selector, count: elements.length })
      }
      const element = elements[0]!
      switch (state) {
        case "visible":
          return isElementVisible(element)
        case "hidden":
          return !isElementVisible(element)
        case "enabled":
          return !isDisabled(element)
        case "disabled":
          return isDisabled(element)
        case "editable":
          return isEditable(element)
        case "checked":
          return element instanceof HTMLInputElement && element.checked
        default:
          return state satisfies never
      }
    })
  }
}

export class Page {
  private readonly root: ParentNode

  constructor(root: ParentNode = document) {
    this.root = root
  }

  locator(selector: string, options?: LocatorOptions) {
    return new Locator(
      () => filterElements([...this.root.querySelectorAll(selector)], options),
      `page.locator(${JSON.stringify(selector)})`,
    )
  }

  textContent(selector: string) {
    return this.locator(selector).textContent()
  }

  innerText(selector: string) {
    return this.locator(selector).innerText()
  }

  getAttribute(selector: string, name: string) {
    return this.locator(selector).getAttribute(name)
  }

  inputValue(selector: string) {
    return this.locator(selector).inputValue()
  }

  getByRole(role: string, options: ByRoleOptions = {}) {
    return Page.locatorBy(
      () => allElements(this.root).filter((element) => matchesRole(element, role, options)),
      `page.getByRole(${JSON.stringify(role)})`,
    )
  }

  getByText(text: TextMatcher, options?: TextOptions) {
    return Page.locatorBy(
      () => allElements(this.root).filter((element) => matchesElementText(element, text, options)),
      `page.getByText(${formatMatcher(text)})`,
    )
  }

  getByLabel(text: TextMatcher, options?: TextOptions) {
    return Page.locatorBy(
      () => allElements(this.root).filter((element) => matchesLabel(element, text, options)),
      `page.getByLabel(${formatMatcher(text)})`,
    )
  }

  getByPlaceholder(text: TextMatcher, options?: TextOptions) {
    return Page.locatorBy(
      () =>
        allElements(this.root).filter((element) =>
          element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
            ? matchesText(element.placeholder, text, !!options?.exact)
            : false,
        ),
      `page.getByPlaceholder(${formatMatcher(text)})`,
    )
  }

  getByTestId(testId: TextMatcher) {
    return Page.locatorBy(
      () =>
        allElements(this.root).filter((element) =>
          matchesText(element.getAttribute("data-testid") ?? "", testId, true),
        ),
      `page.getByTestId(${formatMatcher(testId)})`,
    )
  }

  private static locatorBy(query: Query, label: string) {
    return new Locator(query, label)
  }
}

const waitUntil = <A>(
  effect: Effect.Effect<A, PlaywliteError>,
  options: { readonly selector: string; readonly state: string; readonly timeout?: Duration.Input },
) => {
  const timeout = options.timeout ?? defaultTimeout

  return Effect.gen(function* () {
    const lastError = yield* Ref.make<PlaywliteError | undefined>(undefined)

    return yield* effect.pipe(
      Effect.tapError((error) => Ref.set(lastError, error)),
      Effect.retry({
        schedule: Schedule.spaced(pollInterval),
        while: (error) =>
          error._tag !== "StrictModeViolation" &&
          (error._tag !== "NotInteractable" || error.reason !== "wrong-element"),
      }),
      Effect.timeoutOrElse({
        duration: timeout,
        orElse: () =>
          Ref.get(lastError).pipe(
            Effect.flatMap((error) =>
              Effect.fail(
                error ??
                  new LocatorTimeout({
                    selector: options.selector,
                    state: options.state,
                    timeout: toDuration(timeout),
                  }),
              ),
            ),
          ),
      }),
    )
  })
}

const allElements = (root: ParentNode) => [...root.querySelectorAll("*")]

const allDescendants = (roots: ReadonlyArray<Element>) => {
  const elements: Element[] = []
  for (const root of roots) {
    elements.push(root)
    elements.push(...root.querySelectorAll("*"))
  }
  return unique(elements)
}

const unique = (elements: ReadonlyArray<Element>) => [...new Set(elements)]

const filterElements = (elements: ReadonlyArray<Element>, options?: LocatorOptions) =>
  elements.filter((element) => {
    if (options?.visible !== undefined && isElementVisible(element) !== options.visible)
      return false
    if (
      options?.hasText !== undefined &&
      !matchesText(textContent(element), options.hasText, false)
    )
      return false
    return true
  })

const matchesElementText = (element: Element, text: TextMatcher, options?: TextOptions) => {
  if (
    ["SCRIPT", "STYLE", "NOSCRIPT"].includes(element.tagName) ||
    !!element.ownerDocument.head?.contains(element)
  )
    return false
  if (!matchesText(textContent(element), text, !!options?.exact)) return false
  return ![...element.children].some((child) =>
    matchesText(textContent(child), text, !!options?.exact),
  )
}

const matchesRole = (element: Element, role: string, options: ByRoleOptions) => {
  const actualRole = (() => {
    const explicit = element.getAttribute("role")
    if (explicit) return explicit.toLowerCase()

    const tag = element.tagName.toLowerCase()
    if (tag === "button") return "button"
    if (tag === "select") return "combobox"
    if (tag === "textarea") return "textbox"
    if (tag === "a" && element.hasAttribute("href")) return "link"
    if (tag === "img") return "img"
    if (tag === "ul" || tag === "ol") return "list"
    if (tag === "li") return "listitem"
    if (/^h[1-6]$/.test(tag)) return "heading"
    if (tag === "table") return "table"
    if (tag === "tr") return "row"
    if (tag === "td" || tag === "th") return "cell"
    if (tag === "dialog") return "dialog"

    if (element instanceof HTMLInputElement) {
      if (["button", "submit", "reset"].includes(element.type)) return "button"
      if (element.type === "checkbox") return "checkbox"
      if (element.type === "radio") return "radio"
      if (element.type === "number") return "spinbutton"
      if (["email", "password", "search", "tel", "text", "url"].includes(element.type)) {
        return "textbox"
      }
    }

    return undefined
  })()

  if (actualRole !== role.toLowerCase()) return false
  if (!options.includeHidden && !isElementVisible(element)) return false
  if (options.disabled !== undefined && isDisabled(element) !== options.disabled) return false
  if (options.checked !== undefined) {
    const checked =
      element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type)
        ? element.checked
        : attrBool(element, "aria-checked")
    if (checked !== options.checked) return false
  }
  if (options.selected !== undefined) {
    const selected =
      element instanceof HTMLOptionElement ? element.selected : attrBool(element, "aria-selected")
    if (selected !== options.selected) return false
  }
  if (options.expanded !== undefined && attrBool(element, "aria-expanded") !== options.expanded)
    return false
  if (options.pressed !== undefined && attrBool(element, "aria-pressed") !== options.pressed)
    return false
  if (options.level !== undefined) {
    const ariaLevel = Number(element.getAttribute("aria-level"))
    const tagLevel = /^h([1-6])$/i.exec(element.tagName)
    const level =
      Number.isFinite(ariaLevel) && ariaLevel > 0
        ? ariaLevel
        : tagLevel
          ? Number(tagLevel[1])
          : undefined
    if (level !== options.level) return false
  }

  if (options.name !== undefined) {
    const name = (() => {
      const labelledBy = element.getAttribute("aria-labelledby")
      if (labelledBy) {
        const labels = labelledBy.split(/\s+/).flatMap((id) => {
          const label = element.ownerDocument.getElementById(id)
          return label ? [textContent(label)] : []
        })
        if (labels.length > 0) return normalize(labels.join(" "))
      }

      const ariaLabel = element.getAttribute("aria-label")
      if (ariaLabel) return normalize(ariaLabel)

      if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement
      ) {
        const labels = [...(element.labels ?? [])].map(textContent).join(" ")
        if (labels) return normalize(labels)
        if (
          element instanceof HTMLInputElement &&
          ["button", "submit", "reset"].includes(element.type)
        ) {
          return normalize(element.value)
        }
      }

      const alt = element.getAttribute("alt")
      if (alt) return normalize(alt)
      const title = element.getAttribute("title")
      if (title) return normalize(title)
      return textContent(element)
    })()

    if (!matchesText(name, options.name, !!options.exact)) return false
  }

  return true
}

const matchesLabel = (element: Element, text: TextMatcher, options?: TextOptions) => {
  if (
    !(
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement
    )
  ) {
    return false
  }
  return [...(element.labels ?? [])].some((label) =>
    matchesText(textContent(label), text, !!options?.exact),
  )
}

const attrBool = (element: Element, name: string) => {
  const value = element.getAttribute(name)
  if (value === "true") return true
  if (value === "false") return false
  return undefined
}

const isElementVisible = (element: Element) => {
  const style = getComputedStyle(element)
  if (style.visibility === "hidden" || style.display === "none") return false
  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

const isDisabled = (element: Element) => {
  if (element.getAttribute("aria-disabled") === "true") return true
  if (
    element instanceof HTMLButtonElement ||
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLOptionElement ||
    element instanceof HTMLOptGroupElement
  ) {
    return element.disabled
  }
  return false
}

const isEditable = (element: Element) => {
  if (isDisabled(element)) return false
  if (element instanceof HTMLTextAreaElement) return !element.readOnly
  if (element instanceof HTMLInputElement)
    return (
      !element.readOnly &&
      !["button", "checkbox", "file", "hidden", "image", "radio", "reset", "submit"].includes(
        element.type,
      )
    )
  return isContentEditable(element)
}

const isContentEditable = (element: Element) =>
  element instanceof HTMLElement && element.isContentEditable

const matchesText = (value: string, matcher: TextMatcher, exact: boolean) => {
  const normalized = normalize(value)
  if (matcher instanceof RegExp) return matcher.test(normalized)
  const expected = normalize(matcher)
  return exact ? normalized === expected : normalized.toLowerCase().includes(expected.toLowerCase())
}

const textContent = (element: Element) => normalize(element.textContent ?? "")

const normalize = (value: string) => value.replace(/\s+/g, " ").trim()

const formatMatcher = (matcher: TextMatcher) =>
  matcher instanceof RegExp ? String(matcher) : JSON.stringify(matcher)

const toDuration = (input: Duration.Input | undefined) =>
  Duration.millis(Duration.toMillis(input ?? defaultTimeout))
