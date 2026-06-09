import { CustomerStore } from "@/lib/customer-store"
import { Locator, Page } from "@/lib/playwlite"
import { Clock, Duration, Effect, Schedule } from "effect"
import { MembershipCodeMissing, MembershipCodeRejected, NoPackageAvailable } from "./errors"

export const OPEN_SHEET_BUTTON_TEXT =
  /^(pilih|select|pilih tiket|select ticket|verifikasi kode|verify code)$/i
export const PRESALE_CARD_BUTTON_TEXT = /^(verifikasi kode|verify code)$/i
export const VERIFY_BUTTON_TEXT = /^(verifikasi kodemu|verify your code)$/i
export const ORDER_BUTTON_TEXT = /^(pesan|book)$/i
export const SOLD_OUT_TEXT = /^(terjual habis|sold out)$/i
export const MEMBERSHIP_CODE_USED_TEXT =
  /the code has been used in another transaction|kode.*sudah.*transaksi/i
export const PACKAGE_UNAVAILABLE_MODAL_TEXT = /pick another package|pilih paket lain/i
export const SEE_OTHER_PACKAGES_BUTTON_TEXT = /^(see other packages|lihat paket lain)$/i

const quantitySettleSchedule = Schedule.spaced(Duration.millis(100)).pipe(
  Schedule.both(Schedule.during(Duration.seconds(2))),
)

const isUnavailableModalVisible = (page: Page) =>
  page
    .getByText(PACKAGE_UNAVAILABLE_MODAL_TEXT)
    .filter({ visible: true })
    .count()
    .pipe(Effect.map((count) => count > 0))

const dismissUnavailableModal = (page: Page) =>
  Effect.gen(function* () {
    yield* page
      .getByRole("button", { name: SEE_OTHER_PACKAGES_BUTTON_TEXT, disabled: false })
      .first()
      .click()
    yield* Effect.logDebug("Dismissed unavailable package modal")
  })

const pollUntil = (
  timeout: Duration.Duration,
  outcomes: ReadonlyArray<{ tag: string; when: Effect.Effect<boolean> }>,
) =>
  Effect.gen(function* () {
    const deadline = (yield* Clock.currentTimeMillis) + Duration.toMillis(timeout)
    while ((yield* Clock.currentTimeMillis) < deadline) {
      for (const outcome of outcomes) {
        if (yield* outcome.when) return outcome.tag
      }
      yield* Effect.sleep(Duration.millis(100))
    }
    return "timeout"
  })

const waitForSheetOrUnavailableModal = (page: Page, sheet: Locator) =>
  pollUntil(Duration.seconds(3), [
    { tag: "unavailable", when: isUnavailableModalVisible(page) },
    { tag: "sheet", when: sheet.count().pipe(Effect.map((count) => count > 0)) },
  ])

const waitForPostVerifyOutcome = (page: Page, sheet: Locator) =>
  pollUntil(Duration.seconds(5), [
    { tag: "unavailable", when: isUnavailableModalVisible(page) },
    {
      tag: "code-used",
      when: sheet
        .getByText(MEMBERSHIP_CODE_USED_TEXT)
        .count()
        .pipe(Effect.map((count) => count > 0)),
    },
    {
      tag: "ready",
      when: Effect.gen(function* () {
        const quantityInput = sheet.locator('input[type="number"]').filter({ visible: true })
        const quantityEditor = sheet
          .locator('[data-testid^="ticket-qty-editor-"]')
          .filter({ visible: true })
        return (yield* quantityInput.count()) > 0 || (yield* quantityEditor.count()) > 0
      }),
    },
  ])

export const runPackages = Effect.gen(function* () {
  const store = yield* CustomerStore
  const customer = yield* store.require()
  const buyCount = customer.ticketCount
  const page = new Page(document)

  const cards = page.getByTestId("package-card").filter({ visible: true })
  yield* cards.first().waitFor({ state: "visible" })

  const count = yield* cards.count()

  const presaleButton = cards
    .first()
    .getByRole("button", { name: PRESALE_CARD_BUTTON_TEXT, disabled: false })
    .first()

  let isPresalePage = (yield* presaleButton.count()) > 0

  if (isPresalePage && customer.membershipCode.trim().length === 0) {
    return yield* new MembershipCodeMissing()
  }

  const available: Array<{
    title: string
    card: Locator
    selectButton: Locator
  }> = []

  for (let index = 0; index < count; index++) {
    const card = cards.nth(index)

    const footer = card.getByTestId("package-card-footer")
    if ((yield* footer.getByText(SOLD_OUT_TEXT).count()) > 0) continue

    const titleEl = card.locator("h3")
    const title = (yield* titleEl.first().textContent()).trim()

    const openButton = footer
      .getByRole("button", { name: OPEN_SHEET_BUTTON_TEXT, disabled: false })
      .first()
    if ((yield* openButton.count()) === 0) continue

    available.push({ title, card, selectButton: openButton })
  }

  if (available.length === 0) {
    yield* Effect.logWarning("No packages available")
    return yield* new NoPackageAvailable({ reason: "no-inventory" })
  }

  yield* Effect.logDebug(
    "Available packages",
    available.map((p) => p.title),
  )

  const sheet = page.getByTestId("bottom-sheet-body").filter({ visible: true })
  const closeSheet = Effect.gen(function* () {
    yield* page
      .getByTestId("bottom-sheet-header")
      .filter({ visible: true })
      .getByRole("button", { disabled: false })
      .first()
      .click()
    yield* sheet.waitFor({ state: "hidden" })
  })

  for (const priority of customer.categories) {
    const match = available.find((pkg) => pkg.title.toLowerCase().includes(priority.toLowerCase()))
    if (!match) {
      yield* Effect.logDebug("No package found for", priority)
      continue
    }

    yield* Effect.logDebug("Package found for", priority, match.title)

    yield* match.selectButton.click()
    yield* Effect.logDebug("Opening", match.title)

    const openOutcome = yield* waitForSheetOrUnavailableModal(page, sheet)
    if (openOutcome === "unavailable") {
      yield* dismissUnavailableModal(page)
      continue
    }
    if (openOutcome === "timeout") {
      yield* Effect.logDebug("Timed out opening sheet for", match.title)
      continue
    }

    if (isPresalePage) {
      yield* Effect.logDebug("Verifying presale code for", match.title)
      const codeInput = sheet.locator('input[type="text"]').filter({ visible: true }).first()
      yield* codeInput.fill(customer.membershipCode)
      yield* sheet
        .getByRole("button", { name: VERIFY_BUTTON_TEXT, disabled: false })
        .first()
        .click()

      const verifyOutcome = yield* waitForPostVerifyOutcome(page, sheet)
      if (verifyOutcome === "code-used") {
        return yield* new MembershipCodeRejected()
      }
      if (verifyOutcome === "unavailable") {
        yield* dismissUnavailableModal(page)
        yield* closeSheet
        continue
      }
      if (verifyOutcome === "timeout") {
        yield* Effect.logDebug("Timed out verifying presale code for", match.title)
        yield* closeSheet
        continue
      }
    }

    const quantityInput = sheet.locator('input[type="number"]').filter({ visible: true }).first()
    const quantityEditor = sheet
      .locator('[data-testid^="ticket-qty-editor-"]')
      .filter({ visible: true })
      .first()

    const decrementButton = quantityEditor.locator('button[type="button"]').nth(0)
    const incrementButton = quantityEditor.locator('button[type="button"]').nth(1)

    const quantity = yield* Effect.gen(function* () {
      let value = Number.parseInt(yield* quantityInput.inputValue(), 10)

      while (value !== buyCount) {
        if (Number.isNaN(value)) {
          yield* Effect.logDebug("Quantity input is invalid for", match.title)
          break
        }

        const before = value
        const stepButton = value < buyCount ? incrementButton : decrementButton

        yield* stepButton.click()

        value = yield* Effect.gen(function* () {
          const quantity = Number.parseInt(yield* quantityInput.inputValue(), 10)
          const buttonDisabled = yield* stepButton.isDisabled()
          return { quantity, buttonDisabled } as const
        }).pipe(
          Effect.repeat({
            until: ({ quantity, buttonDisabled }) =>
              quantity !== before || quantity === buyCount || buttonDisabled,
            schedule: quantitySettleSchedule,
          }),
          Effect.map(({ quantity }) => quantity),
        )

        if (value === before) {
          yield* Effect.logDebug("Quantity stuck at", before, "for", match.title)
          break
        }
      }

      return value
    })
    if (quantity !== buyCount) {
      yield* Effect.logDebug(
        "Quantity",
        buyCount,
        "not available for",
        match.title,
        ". Found",
        quantity,
      )
      yield* closeSheet
      continue
    }

    yield* sheet.getByRole("button", { name: ORDER_BUTTON_TEXT, disabled: false }).first().click()
    yield* Effect.logInfo("Ordered", buyCount, "from", match.title, "for", customer.email)
    return
  }

  yield* Effect.logDebug("No priority package available, exiting")
  return yield* new NoPackageAvailable({ reason: "no-matching-category" })
})
