# Handoff: Customer pool allocation for tiket autobuy

## Goal

Replace queue-based browser lifecycle management with a server-side customer data pool. Browsers claim customer rows via RPC when autobuy starts, use that data for the full purchase flow, and retry on failure. Queue management is removed entirely.

## Context

This plan was agreed across planning sessions. No implementation has started yet. Reference `AGENTS.md` for project conventions (Effect, pnpm, `pnpm run check`).

### Existing code to know

- `packages/server/src/cli.ts` — `tx start tiket` spawns RPC server + N browsers
- `packages/server/src/rpc/handlers.ts` — current RPCs: `ReportQueuePosition` (kills browser over threshold), `PushLogs`
- `packages/server/src/rpc/schema.ts` — shared RPC schemas exported to extension as `@tx/server/schema`
- `packages/server/src/lib/browser.ts` — `BrowserManager` spawn/kill
- `packages/extension/src/entrypoints/tiket-autobuy.content/` — autobuy state machine (overview → packages → order); order flow is a stub
- `packages/extension/src/entrypoints/tiket-queue.content/` — **delete**
- `packages/extension/src/lib/config.ts` — persists `{ browserId, port }` from URL init param
- `packages/extension/src/lib/rpc.ts` — content → background → HTTP POST `/rpc` tunnel (browser→server only, no push)
- `fixtures/customer-data.json` — example customer row shape (Google Form CSV headers)
- `scripts/csv-to-json.ts` — CSV → JSON converter using papaparse

---

## Architecture decisions (locked)

### Remove queue management

Delete entirely (do not keep for later):

- `packages/extension/src/entrypoints/tiket-queue.content/` (index + parse)
- `ReportQueuePosition` RPC and `QueuePosition` / `QueuePositionAck` schemas
- `ServerConfig` service and `threshold` field
- `--threshold` / `-t` CLI flag
- `browserManager.kill()` calls from RPC handlers (keep `kill` on `BrowserManager` for process cleanup/finalizer only)

Browsers navigate directly to the event URL. No server-side queue position logic.

### Customer claim: single-phase, unrecoverable

- Browser calls `ClaimCustomer({ browserId })`
- Server atomically pops the next row from the pool and returns it
- No ack RPC — claim is final; row is gone from pool regardless of browser outcome
- Use `SynchronizedRef` from Effect for concurrent-safe pop (see `.references/effect-smol/packages/effect/src/SynchronizedRef.ts`, `modify` / `modifyEffect`)

### Error / retry model

- **No error classification** — cannot distinguish membership-used from sold-out, timeout, DOM miss, etc.
- **Autobuy retries X times** on the **same claimed customer** (stored in extension local storage)
- Each retry runs the full autobuy loop (overview → packages → order)
- After X exhausted failures: clear local customer storage, log as wasted, loop back to `acquireCustomer()` for next row
- Claim is never reverted to pool under any circumstance

### Empty pool

- Log and idle — do not kill browser
- Poll `ClaimCustomer` on an interval (e.g. 5s)
- Standby browsers are useful when customer data arrives later (hot reload)

### No browser affinity

- Any browser can claim any row; first RPC wins
- No special browser roles
- Same browser reload mid-flow resumes from `local:customer` storage (skip re-claim)
- Two different browsers never share a row (SynchronizedRef serializes claims)

### After success

- **Open decision**: exit browser vs loop to claim another customer. Default recommendation: **exit** (one purchase per browser session). Confirm with user if unclear.

---

## Hot reload

Watch the `--customer-data` file and merge new rows into the pool without restarting the server.

### Server-side state

```typescript
type PoolState = {
  available: Customer[]
  claimedKeys: Set<string>  // dedup keys for rows already popped
}
```

Dedup key: derive from stable fields, e.g. `` `${email}:${nik}` `` (normalize whitespace/lowercase).

### Claim (unchanged)

`SynchronizedRef.modify`: pop head from `available`, add key to `claimedKeys`, return customer or null.

### Reload on file change

1. Watch `--customer-data` path via Effect `FileSystem` (NodeServices provides this; NodeFileSystem supports watch — see `.references/effect-smol/packages/platform-node/src/NodeFileSystem.ts`)
2. Debounce ~300ms to coalesce rapid saves
3. On change:
   - Read and parse JSON (reuse Schema decode; same shape as fixture)
   - Filter out rows whose dedup key is in `claimedKeys`
   - Append remaining rows to `available` that aren't already present (dedup by key against current `available`)
   - Log count of rows added

All reload mutations go through the same `SynchronizedRef` as claim — no separate lock needed.

### User workflow

1. Start server with initial JSON (possibly empty or partial)
2. Browsers idle in autobuy poll loop when pool empty
3. User edits CSV → runs `scripts/csv-to-json.ts` → saves JSON
4. Server picks up new rows; idle browsers claim them

### Edge cases

- **Full file rewrite**: claimed rows filtered by `claimedKeys`; only unclaimed rows re-enter pool
- **Duplicate rows in file**: dedup on append prevents double-entry in `available`
- **Invalid JSON on save**: log error, keep current pool unchanged
- **File deleted/moved**: log warning, keep watching (optional: stop watch)

---

## Types & RPC surface

### Shared schema (`packages/server/src/rpc/schema.ts`)

```typescript
Customer {
  name, email, birthDate, gender, nik, phone,
  categories,       // string[] parsed from "Kategori Ticket"
  ticketCount,      // number parsed from "Jumlah Ticket"
  day, membershipCode, paymentMethod
}

InitPayload {
  browserId, port,
  maxRetries        // new — passed from CLI to extension via URL param
}

ClaimCustomerReq { browserId: string }
ClaimCustomerRes { customer: Customer } | { empty: true }

PushLogsPayload { browserId, messages[] }  // keep
```

Map raw JSON keys from fixture (`"Nama Lengkap"`, `"Email"`, etc.) to normalized `Customer` via Schema transform at load time.

### Server services

**CustomerPool** (`packages/server/src/lib/customer-pool.ts` — new)

- `make({ path })`: load initial file, create `SynchronizedRef<PoolState>`, start file watcher fiber
- `claim(): Effect<Customer | null>`
- Internal `reload(): Effect<void>` triggered by watcher

**RpcHandlers** — only `ClaimCustomer` + `PushLogs`

### Extension services

**CustomerStore** (`packages/extension/src/lib/customer.ts` — new)

- Mirror `Config` pattern using wxt storage key `local:customer`
- `get()`, `set(customer)`, `clear()`

---

## Extension flow

### Outer loop (`tiket-autobuy.content/index.ts`)

```
forever:
  customer = acquireCustomer()       // poll until claim succeeds
  result   = runAutobuyWithRetries(customer, maxRetries)
  match result:
    "success"   → log, exit (or loop — TBD)
    "exhausted" → CustomerStore.clear(), log wasted, continue loop
```

### acquireCustomer

1. If `CustomerStore.get()` returns customer → use it (reload resume)
2. Else loop: `ClaimCustomer` → if empty, log + sleep → retry; if customer, store + return

### runAutobuyWithRetries

For attempt 1..maxRetries: run `runOverview → runPackages(customer) → runOrder(customer)`. Any failure → log attempt, continue. All fail → return `"exhausted"`.

### Wire customer into flows

- `flow-packages.ts`: replace hardcoded `BUY_COUNT = 6` with `customer.ticketCount`; match packages using `customer.categories` instead of/in addition to `CATEGORY_PRIORITY`
- `flow-order.ts`: fill checkout form from customer fields (currently stub — implement when form selectors are known)

---

## CLI

```
tx start tiket <url>
  --browser-count / -n       default 1
  --customer-data            path to JSON (required)
  --autobuy-retries          default 3, encoded in InitPayload
  --browser-path
  --extension-path
```

Remove `--threshold`.

---

## Effect layer composition

```
Server:
  NodeServices.layer
    → BrowserManager.layer
    → CustomerPool.layer({ path: customerData })
    → RpcHandlers
    → RpcServer + HttpRouter

Extension autobuy:
  ContentLive + CustomerStore.layer + Config.layer
```

---

## Implementation order

1. **Schema + CustomerPool** — normalized Customer schema, load JSON, SynchronizedRef claim, claimedKeys dedup
2. **Hot reload** — file watcher + debounced reload in CustomerPool
3. **RPC** — add `ClaimCustomer`, remove queue RPC/schemas/ServerConfig
4. **CLI** — `--customer-data`, `--autobuy-retries`, extend InitPayload, remove threshold
5. **Delete queue** — remove tiket-queue content script entrypoint
6. **Extension CustomerStore** — storage get/set/clear
7. **Autobuy loop** — acquireCustomer poll, runAutobuyWithRetries, wire maxRetries from config
8. **Flow wiring** — customer fields into flow-packages and flow-order
9. **Tests** — concurrent claims (no duplicates), reload appends new rows, reload respects claimedKeys, retry exhaust clears storage

Run `pnpm run check` when done.

---

## Failure modes (accepted)

| Scenario | Outcome |
|----------|---------|
| Claim then browser crash | Row lost, unrecoverable |
| Claim, autobuy fails X times | Row lost; browser claims next if pool has rows |
| Membership code already used | Indistinguishable from other errors; wasted after X retries |
| Pool empty | Browser idles, polls; hot reload feeds new rows |
| Two browsers race claim | Different rows (SynchronizedRef) |
| Browser reload mid-autobuy | Resumes same customer from storage |

---

## Out of scope (for now)

- Re-queuing failed customers back to pool
- Error type differentiation (membership vs sold-out)
- Server-side persistence of assignments across restart (in-memory only; restart reloads file fresh, claimedKeys reset)
- Bidirectional server→browser push

---

## Staged git changes (unrelated to this work)

Working tree already has unrelated changes: `fixtures/customer-data.json`, `scripts/csv-to-json.ts`, `packages/server/src/lib/browser.ts`, deleted sync scripts. Do not assume they are part of this feature unless reviewed.
