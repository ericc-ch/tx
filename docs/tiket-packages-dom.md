# Tiket packages: DOM and selectors for autobuy

What the page looks like when hydrated, and **stable hooks** for automation.

Assumes locale **id-ID** or **en-ID**; button labels match regexes in `flow-packages.ts`.

**Stable across builds:** `data-testid` values, hash fragment IDs (`#pricetierDetail`), i18n button text, API paths.

**Unstable:** webpack chunk filenames, CSS module hashes (`Component_name__abc123`), webpack numeric module IDs.

---

## Page lifecycle

1. **SSR shell** — skeleton placeholders, no real package cards
2. **Client fetch** — inventory API loads package list
3. **React hydration** — cards render with `data-testid` attributes
4. **User interaction** — inline expand (general) or hash popup (membership)

Autobuy must wait for visible `[data-testid="package-card"]` before acting.

---

## Packages list (both flows)

### Package card

| Hook           | Value                                           |
| -------------- | ----------------------------------------------- |
| Card container | `[data-testid="package-card"]`                  |
| Card footer    | `[data-testid="package-card-footer"]`           |
| Title          | `h3` inside card                                |
| Select         | `button` name `/^(pilih\|select)$/i` in footer  |
| Sold out       | text `/^(terjual habis\|sold out)$/i` in footer |

### Membership-only on card

Before opening the popup, a whitelist package may show:

- **WhitelistBanner** — look for a banner row with membership icon + text (CSS class name includes `whitelist_banner` but suffix changes per build)
- Banner text from API: `packageWhitelist.translations[0].bannerTitle` (not fixed i18n)
- Generic i18n fallback: `components.whitelist.bannerTitle`

There is no dedicated `data-testid` for the banner; use visible text or structural cues (icon + banner row above footer).

---

## General sale: DOM after “Pilih” / “Select”

On **mobile** (`packages_package_grouping_mobile__*`), the card only exposes **Pilih / Select** in the footer. Clicking it opens a bottom sheet; qty and **Pesan / Book** live in `[data-testid="bottom-sheet-body"]`, not on the card.

```
[data-testid="package-card"]
├── h3                          → package title
├── …                           → price, benefits
└── [data-testid="package-card-footer"]
    └── button "Pilih" / "Select"

[data-testid="bottom-sheet-body"]   → Order Details / Detail Pesanan
├── h2                            → sheet title
├── package title (selected tier)
├── [data-testid="ticket-qty-editor-{code}"]
│   ├── input[type="number"]
│   └── button (×2)               → decrement, increment
└── sticky footer
    └── button "Pesan" / "Book"
```

The `{code}` suffix is a package or price-tier code from API data — treat it as dynamic; use `[data-testid^="ticket-qty-editor-"]`.

**Extension selectors today** (from `flow-packages.ts`):

```ts
page.getByTestId("package-card")
card.getByTestId("package-card-footer")
card.getByRole("button", { name: /^(pilih|select)$/i })

const sheet = page.getByTestId("bottom-sheet-body").filter({ visible: true })
sheet.locator('input[type="number"]').filter({ visible: true })
sheet.locator('[data-testid^="ticket-qty-editor-"]')
sheet.getByRole("button", { name: /^(pesan|book)$/i })
```

Desktop may still expand qty inline on the card; autobuy targets the mobile bottom-sheet path.

---

## Membership / presale: hash routes

Tiket uses a **hash router** for overlays. Enum names in JS (`PRICETIER_DETAIL`, `PACKAGE_DETAIL_POPUP`) map to **stable DOM ids**:

| Route enum (in JS)     | DOM hash / id         | Purpose                                    |
| ---------------------- | --------------------- | ------------------------------------------ |
| `PACKAGE_DETAIL_POPUP` | `#packageDetailPopup` | Package info modal (photos, benefits, T&C) |
| `PRICETIER_DETAIL`     | `#pricetierDetail`    | **Detail Pesanan** — date, code, qty, book |

To rediscover these on a new build: search any downloaded `.js` for `PRICETIER_DETAIL` or `#pricetierDetail` — they tend to stay paired.

Membership booking uses **`#pricetierDetail`**, not inline card qty.

Opening the sheet updates `location.hash`. After click, expect the hash to reference `pricetierDetail` and a package identifier.

---

## Detail Pesanan popup (membership flow)

### Container

| Hook                                   | Notes                                                                |
| -------------------------------------- | -------------------------------------------------------------------- |
| `[data-testid="package-detail-modal"]` | Package **info** modal — different from the pricetier order sheet    |
| Sheet / dialog title                   | **Detail Pesanan** / _Order Details_ (`pages.pricetier.headerTitle`) |

The pricetier UI is a sticky-footer bottom sheet on mobile, modal on desktop. Prefer locating the **visible dialog/sheet root** in DevTools once, then scoping all locators under it.

### Whitelist code section (before verified)

Rendered when `packageWhitelist` is set and `whitelistEligibility[whitelistId]` is not. Component name in source: `WhitelistCodeForm` (lazy-loaded).

Expected structure (semantic — class suffixes vary):

```
… sheet body …
├── WhitelistBanner (optional, API bannerTitle)
├── heading / label     → "Masukkan kodemu"
├── input               → text field (membership code)
├── button              → "Verifikasi kodemu"
└── success message     → "Hore! Kamu bisa membeli paket khusus ini!" (after OK)
```

**Suggested selectors** (role + visible text — more stable than CSS modules):

```ts
// Indonesian
page.getByRole("button", { name: /^verifikasi kodemu$/i })
page.getByLabel(/kode keanggotaan fan club/i) // if label is wired
page.getByText(/^hore! kamu bisa membeli paket khusus ini!$/i)

// English fallback
page.getByRole("button", { name: /^verify your code$/i })
```

Optional: search bundles for `whitelist_code_wrapper` — logical class name, hash suffix changes.

### After verification: order sections

Same sheet, content unlocks:

| Section    | i18n title (ID)         | Notes                                  |
| ---------- | ----------------------- | -------------------------------------- |
| Date       | Tanggal / Pilih tanggal | May be pre-filled from URL `?date=`    |
| Time slot  | Slot Waktu              | If product uses sessions               |
| Ticket qty | Jumlah Tiket            | `pages.pricetier.ticketQuantity.title` |
| Total      | Total Harga             | `pages.pricetier.totalPayment`         |

Qty editor inside popup (same testid pattern as card):

```
[data-testid="ticket-qty-editor-{code}"]
├── input[type="number"]
└── +/- buttons
```

**Important:** for membership, scope locators to the **open sheet**, not the card behind it:

```ts
// Prefer the dialog/bottomsheet element you identify on a live page
const sheet = page.getByRole("dialog").filter({ visible: true })
// or: page.locator("#pricetierDetail").filter({ visible: true })

sheet.locator('[data-testid^="ticket-qty-editor-"]')
sheet.getByRole("button", { name: /^(pesan|book)$/i })
```

Avoid coupling to `#pricetierDetail` alone if it is a hidden anchor; the visible overlay may be a child dialog.

### Footer gating

Until code is verified, the sticky **Pesan** footer is **not rendered** (`hasWhitelist && !isWhitelistEligible` → nothing).

Sequence for autobuy:

1. Sheet open — footer may be absent or show verify-only UI
2. After verify — date/qty sections appear
3. Footer shows **Pesan** when qty + schedule valid

---

## Package detail modal (informational)

`[data-testid="package-detail-modal"]` — opened from package “detail”, hash `#packageDetailPopup`.

Footer CTA on this modal:

- **Verifikasi kodemu** if `packageWhitelist` and not verified
- **Pilih tiket** if verified or general
- Click → opens `#pricetierDetail`

Useful when the list card does not expand inline for whitelist packages.

---

## Booking form (downstream)

After **Pesan**, user lands on the order page. Whitelist code may appear again in order summary with the same banner + input — usually already satisfied from session state.

Search order bundles for `pages.order.orderDetail` strings and order-specific testids (e.g. bundle modals) if you automate past the packages step.

---

## Locale matrix (buttons)

| Action        | Indonesian        | English          |
| ------------- | ----------------- | ---------------- |
| Select        | Pilih             | Select           |
| Book          | Pesan             | Book             |
| Verify code   | Verifikasi kodemu | Verify your code |
| Select ticket | Pilih tiket       | Select ticket    |
| Sheet title   | Detail Pesanan    | Order Details    |

Extension regexes already cover ID/EN for Pilih and Pesan. Add verify/select-ticket patterns for the membership branch.

---

## DOM checklist for implementing membership autobuy

- [x] Detect whitelist package before assuming inline qty
- [x] Wait for visible sheet/dialog (title **Detail Pesanan** or hash change)
- [x] Locate code input (first `input[type="text"]` in sheet)
- [x] Click verify, wait for qty editor in sheet
- [x] Scope qty editor to sheet, not background card
- [x] Click **Pesan** in sheet footer only after footer exists
- [ ] Handle API errors: not found, redeemed (visible error strings in i18n)
- [ ] Re-verify selectors on a **live** page after each tiket deploy

---

## What a saved HTML dump will _not_ contain

A browser “Save Page” often misses:

- Lazy-loaded JS (code form, full package card module)
- Hydrated package cards (saved too early)
- Hash popup DOM (never opened during save)

For DOM validation, use DevTools on a **live** packages page at each step, or follow [tiket-reverse-engineering.md](./tiket-reverse-engineering.md).
