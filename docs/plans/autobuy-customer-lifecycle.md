# Autobuy customer lifecycle & presale handling

Handoff from planning session (2026-06-04). Next session: implement phases 1–3, then membership branch (phase 4).

## Problem statement

During a live BABYMONSTER Weverse presale run (4 customers in pool), browsers did **not** behave as expected:

- Expected: fail → discard customer → claim next
- Observed: browsers **sit idle** or **loop indefinitely** on the first customer

Root cause (code review, not fully debugged live): `runAutobuyPipeline` has silent stall paths (`idleSleep` + `continue`) that **never fail**, so the outer session loop in `autobuy-session.ts` never reaches discard/claim-next. Additionally, `CustomerPool` only supports `claim()` — no finish/discard — so failed customers leave the pool permanently with no server-side resolution.

## Related artifacts

| Path | Relevance |
|------|-----------|
| `packages/extension/src/entrypoints/tiket.content/autobuy-session.ts` | Outer claim loop, blind 3× retry |
| `packages/extension/src/entrypoints/tiket.content/autobuy-pipeline.ts` | Inner loop with silent idle stalls |
| `packages/server/src/lib/customer-pool.ts` | Claim-only pool, `claimedKeys` limbo |
| `packages/server/src/rpc/handlers.ts` | `ClaimCustomer` RPC |
| `packages/extension/src/entrypoints/tiket.content/flow-packages.ts` | Presale/membership branch to tighten |
| `packages/extension/src/entrypoints/tiket.content/rate-limit-dialog.ts` | 429 handling precedent |
| `packages/extension/src/entrypoints/tiket.content/errors.ts` | Error taxonomy (thin today) |
| `fixtures/tiket-babymonster-weverse-packages-code-used-en.html` | Code-already-used bottom sheet |
| `fixtures/tiket-babymonster-weverse-packages-unavailable-modal-en.html` | "Pick another package" modal |
| `fixtures/tiket-babymonster-weverse-queue-en.html` | Queue-it (out of scope for now) |
| `fixtures/customer-data.json` | BABYMONSTER test customers with `membershipCode` |

## Locked-in decisions

### Retry rule (simple — no partial checkout retry)

| Outcome | Action |
|---------|--------|
| **Success** (order placed) | Report `finished` → **session exits**, browser sits idle (one order per browser) |
| **429 / rate-limit** | Retry **same customer once** (after handling dialog) |
| **Everything else** | Report `discarded` → clear local state → **claim next customer** |

Explicitly **no**:

- 3× blanket retry on whole pipeline
- Retry on sold out / no package / no matching category
- Retry on membership missing or code already used
- Partial checkout retry (deferred — too complex for v1)
- Multiple orders per browser
- Returning discarded customers to pool
- Queue-it handling (ignored for now)

### Membership / presale (phase 4)

| Situation | Action |
|-----------|--------|
| Presale page, no `membershipCode` | `MembershipCodeMissing` → discard immediately |
| Code already used | `MembershipCodeRejected` → discard immediately (fail whole run for that customer) |
| Unavailable modal ("See Other Packages") | Dismiss, try next category |
| No categories left | `NoPackageAvailable` → discard |

Presale detection stays DOM-based (card `Verify code` button), not event-slug based.

## Target architecture

### Server: customer lifecycle

```
available → assigned(browserId) → finished | discarded
```

**New RPC:** `ResolveCustomer({ browserId, customerKey, outcome, reason })`

- `outcome`: `"finished"` | `"discarded"`
- `customerKey`: existing `email:nik` from `packages/server/src/rpc/schema.ts`
- **Claim** idempotent per browser: if browser already has assignment, return it (crash recovery)
- **Discarded/finished** keys go to settled set — **never** back to `available`

Optional later: pool stats RPC for ops visibility.

### Extension: session loop

Replace `Effect.retry(runAutobuyPipeline, 3×)` with explicit disposition:

```
loop:
  customer = claim (or resume assignment)
  retried429 = false

  run pipeline
  on success     → resolve(finished) → exit session
  on 429         → if !retried429: handle dialog, retried429=true, retry pipeline
                   else: resolve(discarded) → clear → claim next
  on anything else → resolve(discarded) → clear store/progress, resetToOverview → claim next
```

`discard` path always: `ResolveCustomer` RPC → `CustomerStore.remove()` → `AutobuyProgress.clear()` → `resetToOverview`.

### Pipeline: fail loudly (fixes infinite idle)

Remove or bound silent stall paths in `autobuy-pipeline.ts`:

| Current behavior | Change |
|------------------|--------|
| Unknown page → `idleSleep` forever | Fail after ~10s (`StepTimeout` or new error) |
| Progress/page mismatch → `idleSleep` forever | Fail after ~10s |
| Presale verify → blind qty wait | Explicit membership errors or bounded wait |

**Rule:** if no progress within bounded time, **fail the attempt** so disposition runs.

### Disposition (single function)

```typescript
// conceptual — no checkpoint logic
if (success)                    → finish
if (is429(error) && !retried429) → retry once
else                             → discard
```

429 = rate-limit dialog (`rate-limit-dialog.ts`). Do not build a state machine.

### Membership branch in `flow-packages.ts` (phase 4)

After card click, wait for **sheet OR unavailable modal** (modal fixture has no bottom sheet).

After verify click, wait for **qty editor OR code-used error OR unavailable modal** — do not proceed to quantity blindly.

New errors:

- `MembershipCodeMissing`
- `MembershipCodeRejected`

Wire into `autobuyFailureReason` with human-readable strings.

Existing `NoPackageAvailable` stays for inventory (discard, no retry).

### Overlay pattern (optional extract, not blocking v1)

Follow `rate-limit-dialog.ts` shape for package-unavailable modal if `flow-packages` gets crowded. Do not build a framework.

## Implementation phases

| Phase | Scope | Key files |
|-------|-------|-----------|
| **1** | `ResolveCustomer` RPC + pool assignment map + idempotent claim | `customer-pool.ts`, `schema.ts`, `handlers.ts`, tests in `customer-pool.test.ts` |
| **2** | Pipeline stuck watchdog / kill silent idle loops | `autobuy-pipeline.ts`, possibly `wait-for-page.ts`, `errors.ts` |
| **3** | Session rewrite: 429-once + discard loop, remove 3× retry | `autobuy-session.ts` |
| **4** | Membership errors + outcome waits in packages flow | `flow-packages.ts`, `errors.ts`, fixtures tests |
| **5** | Integration tests | `packages/extension/test/tiket.test.ts` |

**Recommended order:** 1 → 2 → 3 (core fix for live "stuck on customer #1"), then 4 → 5.

Run `pnpm run check` when done.

## Tests to add (phase 5)

| Case | Fixture / setup | Assert |
|------|-----------------|--------|
| Code used | `tiket-babymonster-weverse-packages-code-used-en.html` | `MembershipCodeRejected`, discard |
| Unavailable modal | `tiket-babymonster-weverse-packages-unavailable-modal-en.html` | dismiss → next category or discard |
| LANY regression | `tiket-lany-packages-en/id.html` | unchanged |
| Success stops session | mock resolve finished | no second claim |
| Stuck page fails | unknown route fixture or synthetic | fails within timeout, not infinite sleep |

**Gap:** no happy-path presale fixture (verified code → qty editor → book). Capture when available live; not blocking failure handling.

## Explicitly out of scope

- Queue-it content script (`fixtures/tiket-babymonster-weverse-queue-en.html`)
- Partial checkout retry
- Event-specific config (`babymonster`, `weverse` slugs in code)
- Making `membershipCode` optional in schema
- Generic Tiket state machine / overlay framework

## Prior session work (already done)

- Renamed/deduped BABYMONSTER fixtures from `message*.txt` to `tiket-babymonster-weverse-*.html`
- Deleted duplicate `message(1).txt` and `message(4).txt`

## Open questions (none blocking v1)

- ID-locale strings for membership errors/modals (only EN fixtures today)
- Pool stats RPC for ops (nice-to-have)
