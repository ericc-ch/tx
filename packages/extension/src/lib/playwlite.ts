import { domChangeSchedule } from "@/lib/dom-watch"
import { Data, Duration, Effect } from "effect"

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

type TimeoutOptions = {
  readonly timeout?: Duration.Input
}

type ActionOptions = TimeoutOptions & {
  readonly force?: boolean
  readonly trial?: boolean
}

type SelectOption =
  | string
  | {
      readonly value?: string
      readonly label?: string
      readonly index?: number
    }

const defaultTimeout = Duration.seconds(30)

type WaitForFirstOutcome = {
  readonly tag: string
  readonly when: Effect.Effect<boolean, never, never>
}

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

type NotInteractableReason = "disabled" | "hidden" | "not-editable" | "wrong-element"

export class NotInteractable extends Data.TaggedError("NotInteractable")<{
  readonly selector: string
  readonly reason: NotInteractableReason
}> {
  override get message() {
    return `${this.selector} is not interactable: ${this.reason}`
  }
}

class ElementNotFound extends Data.TaggedError("ElementNotFound")<{
  readonly selector: string
}> {}

class StateNotMet extends Data.TaggedError("StateNotMet")<{
  readonly selector: string
  readonly state: string
}> {}

export type PlaywliteError = LocatorTimeout | StrictModeViolation | NotInteractable

type Query = () => Array<Element>

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
        const elements: Array<Element> = []
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
      () => collectByRole(this.query(), role, options),
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
      () => collectByPlaceholder(this.query(), text, options),
      `getByPlaceholder(${formatMatcher(text)})`,
    )
  }

  getByTestId(testId: TextMatcher) {
    return this.locatorBy(
      () => collectByTestId(this.query(), testId),
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

  textContent(options?: TimeoutOptions) {
    return pollAttached({
      query: this.query,
      selector: this.selector,
      run: (element) => Effect.succeed(element.textContent),
      ...timeoutOption(options?.timeout),
    })
  }

  innerText(options?: TimeoutOptions) {
    const selector = this.selector
    return pollAttached({
      query: this.query,
      selector: this.selector,
      run: (element) =>
        element instanceof HTMLElement
          ? Effect.succeed(element.innerText ?? element.textContent ?? "")
          : Effect.fail(new NotInteractable({ selector, reason: "wrong-element" })),
      ...timeoutOption(options?.timeout),
    })
  }

  getAttribute(name: string, options?: TimeoutOptions) {
    return pollAttached({
      query: this.query,
      selector: this.selector,
      run: (element) => Effect.succeed(element.getAttribute(name)),
      ...timeoutOption(options?.timeout),
    })
  }

  inputValue(options?: TimeoutOptions) {
    const selector = this.selector
    return pollAttached({
      query: this.query,
      selector: this.selector,
      run: (element) => {
        if (
          element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement ||
          element instanceof HTMLSelectElement
        ) {
          return Effect.succeed(element.value)
        }
        return Effect.fail(new NotInteractable({ selector, reason: "wrong-element" }))
      },
      ...timeoutOption(options?.timeout),
    })
  }

  isVisible() {
    return queryStateInstant(this.query, this.selector, "visible")
  }

  isHidden() {
    return queryStateInstant(this.query, this.selector, "hidden")
  }

  isEnabled(options?: TimeoutOptions) {
    return this.pollBooleanState("enabled", options)
  }

  isDisabled(options?: TimeoutOptions) {
    return this.pollBooleanState("disabled", options)
  }

  isEditable(options?: TimeoutOptions) {
    return this.pollBooleanState("editable", options)
  }

  isChecked(options?: TimeoutOptions) {
    return this.pollBooleanState("checked", options)
  }

  waitFor(options: WaitOptions = {}) {
    const state = options.state ?? "visible"
    const query = this.query
    const selector = this.selector
    return poll(
      Effect.gen(function* () {
        const element = yield* lookupStrict(query, selector)
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

        if (matches) return

        if (!element && (state === "attached" || state === "visible")) {
          return yield* new ElementNotFound({ selector })
        }
        return yield* new StateNotMet({ selector, state })
      }),
      { selector, state, ...timeoutOption(options.timeout) },
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

  dispatchEvent(type: string, eventInit: EventInit = {}, options?: TimeoutOptions) {
    return pollAttached({
      query: this.query,
      selector: this.selector,
      run: (element) =>
        Effect.sync(() => {
          element.dispatchEvent(
            new Event(type, { bubbles: true, cancelable: true, composed: true, ...eventInit }),
          )
        }),
      ...timeoutOption(options?.timeout),
    })
  }

  private locatorBy(query: Query, label: string) {
    return new Locator(query, `${this.selector}.${label}`)
  }

  private pollBooleanState(
    state: "enabled" | "disabled" | "editable" | "checked",
    options?: TimeoutOptions,
  ) {
    return pollAttached({
      query: this.query,
      selector: this.selector,
      run: (element) => Effect.succeed(evaluateElementState(element, state)),
      ...timeoutOption(options?.timeout),
    })
  }

  private actionable(
    checks: ReadonlyArray<"visible" | "enabled" | "editable">,
    options: ActionOptions,
  ) {
    const query = this.query
    const selector = this.selector
    return pollAttached({
      query,
      selector,
      run: (element) => {
        if (!options.force) {
          if (checks.includes("visible") && !isElementVisible(element)) {
            return Effect.fail(new NotInteractable({ selector, reason: "hidden" }))
          }
          if (checks.includes("enabled") && isDisabled(element)) {
            return Effect.fail(new NotInteractable({ selector, reason: "disabled" }))
          }
          if (checks.includes("editable") && !isEditable(element)) {
            return Effect.fail(new NotInteractable({ selector, reason: "not-editable" }))
          }
        }
        return Effect.succeed(element)
      },
      state: "actionable",
      ...timeoutOption(options.timeout),
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
      () => collectByRole([this.root], role, options),
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
      () => collectByPlaceholder([this.root], text, options),
      `page.getByPlaceholder(${formatMatcher(text)})`,
    )
  }

  getByTestId(testId: TextMatcher) {
    return Page.locatorBy(
      () => collectByTestId([this.root], testId),
      `page.getByTestId(${formatMatcher(testId)})`,
    )
  }

  waitForFirst(outcomes: ReadonlyArray<WaitForFirstOutcome>, options?: { timeout?: Duration.Input }) {
    const timeout = toDuration(options?.timeout ?? defaultTimeout)
    const schedule = domChangeSchedule(this.root)

    const check = Effect.gen(function* () {
      for (const outcome of outcomes) {
        if (yield* outcome.when) return outcome.tag
      }
      return "pending" as const
    })

    return check.pipe(
      Effect.repeat({
        until: (result) => result !== "pending",
        schedule,
      }),
      Effect.timeoutOrElse({
        duration: timeout,
        orElse: () => Effect.succeed("timeout" as const),
      }),
    )
  }

  private static locatorBy(query: Query, label: string) {
    return new Locator(query, label)
  }
}

const isRetriablePollError = (error: unknown) =>
  error instanceof ElementNotFound ||
  error instanceof StateNotMet ||
  (error instanceof NotInteractable && error.reason !== "wrong-element")

const poll = <A, E>(
  attempt: Effect.Effect<A, E, never>,
  options: { readonly selector: string; readonly state: string; readonly timeout?: Duration.Input },
) => {
  const timeout = toDuration(options.timeout)
  const schedule = domChangeSchedule(document)

  return attempt.pipe(
    Effect.retry({
      while: isRetriablePollError,
      schedule,
    }),
    Effect.timeoutOrElse({
      duration: timeout,
      orElse: () =>
        Effect.fail(
          new LocatorTimeout({
            selector: options.selector,
            state: options.state,
            timeout,
          }),
        ),
    }),
  )
}

const lookupStrict = (query: Query, selector: string) =>
  Effect.sync(query).pipe(
    Effect.flatMap((elements) => {
      if (elements.length > 1) {
        return Effect.fail(new StrictModeViolation({ selector, count: elements.length }))
      }
      return Effect.succeed(elements[0])
    }),
  )

const pollAttached = <A, E>({
  query,
  selector,
  run,
  timeout,
  state = "attached",
}: {
  readonly query: Query
  readonly selector: string
  readonly run: (element: Element) => Effect.Effect<A, E>
  readonly timeout?: Duration.Input
  readonly state?: string
}) =>
  poll(
    Effect.gen(function* () {
      const element = yield* lookupStrict(query, selector).pipe(
        Effect.filterOrFail(
          (el): el is Element => el !== undefined,
          () => new ElementNotFound({ selector }),
        ),
      )
      return yield* run(element)
    }),
    { selector, state, ...timeoutOption(timeout) },
  )

const timeoutOption = (timeout: Duration.Input | undefined) =>
  timeout === undefined ? {} : { timeout }

const queryStateInstant = (query: Query, selector: string, state: "visible" | "hidden") =>
  Effect.gen(function* () {
    const element = yield* lookupStrict(query, selector)
    if (element === undefined) return state === "hidden"
    return state === "visible" ? isElementVisible(element) : !isElementVisible(element)
  })

const evaluateElementState = (
  element: Element,
  state: "enabled" | "disabled" | "editable" | "checked",
) => {
  switch (state) {
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
}

const allElements = (root: ParentNode) => [...root.querySelectorAll("*")]

const escapeCssAttr = (value: string) =>
  typeof CSS !== "undefined" && "escape" in CSS
    ? CSS.escape(value)
    : value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')

const roleSelector = (role: string) => {
  switch (role.toLowerCase()) {
    case "button":
      return 'button, [role="button"], input[type="button"], input[type="submit"], input[type="reset"]'
    case "link":
      return 'a[href], [role="link"]'
    case "textbox":
      return 'textarea, [role="textbox"], input:not([type]), input[type="text"], input[type="email"], input[type="password"], input[type="search"], input[type="tel"], input[type="url"]'
    case "checkbox":
      return 'input[type="checkbox"], [role="checkbox"]'
    case "radio":
      return 'input[type="radio"], [role="radio"]'
    case "combobox":
      return "select, [role=\"combobox\"]"
    case "heading":
      return 'h1, h2, h3, h4, h5, h6, [role="heading"]'
    case "img":
      return 'img, [role="img"]'
    case "list":
      return "ul, ol, [role=\"list\"]"
    case "listitem":
      return "li, [role=\"listitem\"]"
    case "dialog":
      return 'dialog, [role="dialog"]'
    default:
      return undefined
  }
}

const queryAll = (roots: ReadonlyArray<ParentNode | Element>, selector: string) => {
  const elements: Array<Element> = []
  for (const root of roots) {
    elements.push(...root.querySelectorAll(selector))
  }
  return unique(elements)
}

const collectByRole = (
  roots: ReadonlyArray<ParentNode | Element>,
  role: string,
  options: ByRoleOptions,
) => {
  const selector = roleSelector(role)
  const candidates = selector ? queryAll(roots, selector) : allDescendants(roots)
  return candidates.filter((element) => matchesRole(element, role, options))
}

const collectByTestId = (roots: ReadonlyArray<ParentNode | Element>, testId: TextMatcher) => {
  if (typeof testId === "string") {
    return queryAll(roots, `[data-testid="${escapeCssAttr(testId)}"]`)
  }
  return allDescendants(roots).filter((element) =>
    matchesText(element.getAttribute("data-testid") ?? "", testId, true),
  )
}

const collectByPlaceholder = (
  roots: ReadonlyArray<ParentNode | Element>,
  text: TextMatcher,
  options?: TextOptions,
) =>
  queryAll(roots, "input[placeholder], textarea[placeholder]").filter(
    (element) =>
      element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
        ? matchesText(element.placeholder, text, !!options?.exact)
        : false,
  )

const allDescendants = (roots: ReadonlyArray<ParentNode | Element>) => {
  const elements: Array<Element> = []
  for (const root of roots) {
    if (root instanceof Element) elements.push(root)
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
    const ariaLevel = Number.parseInt(element.getAttribute("aria-level") ?? "", 10)
    const tagLevel = /^h([1-6])$/i.exec(element.tagName)
    const level =
      Number.isFinite(ariaLevel) && ariaLevel > 0
        ? ariaLevel
        : tagLevel
          ? Number.parseInt(tagLevel[1] ?? "", 10)
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
  matcher instanceof RegExp ? matcher.toString() : JSON.stringify(matcher)

const toDuration = (input: Duration.Input | undefined) =>
  Duration.millis(Duration.toMillis(input ?? defaultTimeout))
