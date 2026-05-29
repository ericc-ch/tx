# Browser memory and spawn density

How to run as many Helium/Chromium instances as possible on constrained RAM (e.g. 32 GB), while keeping **isolated cookies and extension storage** per autobuy session.

**Related code:** `packages/server/src/lib/browser.ts`  
**Benchmark script:** `scripts/test-profiles.fish`

---

## Goal

Each autobuy session needs its own:

- tiket cookies / site storage
- extension storage (`local:config`, `local:customer`)
- `browserId` for RPC routing

We do **not** need a separate OS process tree per session unless crash isolation or fingerprint independence requires it.

---

## Isolation models

| Model | Cookie isolation | Extension storage | Process overhead |
| --- | --- | --- | --- |
| **Tabs, same profile** | No | Shared | Lowest |
| **Chrome profiles, one `--user-data-dir`** | Yes | Per profile | Low (shared browser/GPU/network) |
| **Separate `--user-data-dir` per spawn (current)** | Yes | Per dir | High (full tree each time) |

### Tabs are not enough

`sessionStorage` (e.g. tiket `whitelistEligibility`) is per tab, but **cookies and `localStorage` are shared** across tabs in the same profile. Two parallel autobuy tabs would share login state and extension config.

### Chrome profiles are enough

Repeated launches with the **same** `--user-data-dir` and different `--profile-directory` attach to one browser process ([Chromium docs](https://chromium.googlesource.com/chromium/reference_builds/chrome_linux/+/HEAD/chrome.1)):

```fish
set SHARED /tmp/tx-run-abc

# Starts browser
helium --user-data-dir=$SHARED --profile-directory=session-1 ... 'https://www.tiket.com/...'

# Attaches new profile (same process)
helium --user-data-dir=$SHARED --profile-directory=session-2 ... 'https://www.tiket.com/...'
```

Each profile gets its own cookie jar, site storage, and extension install state. Cookie isolation verified manually with httpbin.

### What changes in `BrowserManager`

Conceptually:

- One shared temp `--user-data-dir` per `tx start tiket` run
- Each spawn uses `--profile-directory=$browserId` instead of a unique top-level user-data-dir
- `kill()` closes that profile’s windows instead of SIGKILL on a dedicated process (unless it was the last profile)

---

## RAM benchmark

### How we measure

`scripts/test-profiles.fish` compares two models at a given instance count (default 10):

1. **Shared + profile:** one `--user-data-dir`, N `--profile-directory` spawns (attach after the first).
2. **Separate dir:** N distinct `--user-data-dir` values (current `browser.ts` model).

For each model while instances are alive (headless `about:blank`):

1. `pgrep -f "user-data-dir=..."` → all Helium/Chromium PIDs in that tree.
2. `ps -o rss=` per PID → resident memory in KB.
3. **Sum RSS** across PIDs → reported total.
4. Divide by N → RSS per instance.

No tx extension loaded; `--disable-extensions` disables Helium built-ins too (lean baseline).

### Accuracy caveats

- **Relative compare is reliable** — same method for both models.
- **Absolute RSS is inflated** — summing per-process RSS double-counts shared pages (code, some mappings). PSS/USS would be lower. Use ratios and per-instance trends, not summed RSS as exact system cost.
- **Idle `about:blank`** — measures Chrome infrastructure, not tiket page weight. Real autobuy pages add substantially more per session.
- **Linear capacity extrapolation** is order-of-magnitude only.

Run:

```fish
fish scripts/test-profiles.fish      # default N=10
fish scripts/test-profiles.fish 20   # custom count
```

Helium 0.12.4.1 (Chromium 148), Linux, no extensions:

| N | Model | Helium processes | Browser processes | Total RSS | Per instance |
| --- | --- | ---: | ---: | ---: | ---: |
| 2 | Shared + profile | 12 | 3 | 989 MB | ~495 MB |
| 2 | Separate user-data-dir | 24 | 6 | 1864 MB | ~932 MB |
| 10 | Shared + profile | 12 | 3 | 1004 MB | **~100 MB** |
| 10 | Separate user-data-dir | 120 | 30 | 9033 MB | **~903 MB** |

At N=2, shared saves ~47% total RSS. At N=10, ~89% — separate dirs scale linearly with full browser trees; shared amortizes one browser/GPU/network stack.

### 32 GB capacity hint (~22 GB for browsers)

From per-instance RSS above (idle baseline only):

| Model | N=2 extrapolation | N=10 extrapolation |
| --- | ---: | ---: |
| Shared + profile | ~44 | ~219 |
| Separate user-data-dir | ~23 | ~24 |

The N=10 per-instance numbers are more representative at target density. Expect fewer instances once tiket pages and the tx extension are loaded.

---

## Command-line flags

Reference: [Chromium command-line switches](https://peter.sh/experiments/chromium-command-line-switches/)

**Policy:** prefer **stability** over marginal RAM from aggressive flags. Density comes from the multi-profile spawn model, not from weakening process isolation or renderer/GPU behavior.

### Current flags (`browser.ts`) — keep

These disable idle throttling and backgrounding so occluded autobuy windows stay responsive. They cost RAM but are **intentional** for reliability:

```typescript
const browserSwitches = [
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-default-apps",
  "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding",
  "--disable-backgrounding-occluded-windows",
  "--disable-hang-monitor",
  "--disable-prompt-on-repost",
  "--disable-popup-blocking",
  "--disable-component-update",
]
```

Do **not** remove the anti-throttle trio to save memory unless you accept missed timers / stalled flows on background windows.

### Do we still need extra flags?

**Priority:**

1. **Multi-profile spawn model** — main RAM lever (~89% at N=10 in benchmark).
2. **Stable housekeeping flags** — small savings, no change to site isolation, renderer count, or GPU process model.

Skip flags that consolidate renderers, disable site isolation, merge GPU in-process, cap caches aggressively, or use `--single-process`. Those trade stability and predictable behavior for uncertain RAM wins.

### Stable additions (recommended)

Same class as Playwright’s defaults: disable background services Chrome would run anyway, not used by headless-ish automation.

| Flag | Purpose |
| --- | --- |
| `--disable-background-networking` | No background network tasks |
| `--disable-sync` | No sync |
| `--disable-breakpad` | No crash reporter |
| `--disable-client-side-phishing-detection` | No phishing checks |
| `--disable-domain-reliability` | No domain reliability uploads |
| `--disable-component-extensions-with-background-pages` | No built-in component extension backgrounds |
| `--disable-field-trial-config` | No A/B field trials |
| `--metrics-recording-only` | Metrics without upload |
| `--password-store=basic` | No keyring / wallet integration |
| `--disable-ipc-flooding-protection` | Avoid IPC throttling under heavy automation |
| `--mute-audio` | No audio buffers |
| `--disable-extensions-except=$EXT` | Only tx extension (pair with `--load-extension`) |

Proposed stable set (existing + additions):

```typescript
const browserSwitches = [
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-default-apps",
  "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding",
  "--disable-backgrounding-occluded-windows",
  "--disable-hang-monitor",
  "--disable-prompt-on-repost",
  "--disable-popup-blocking",
  "--disable-component-update",
  "--disable-background-networking",
  "--disable-sync",
  "--disable-breakpad",
  "--disable-client-side-phishing-detection",
  "--disable-domain-reliability",
  "--disable-component-extensions-with-background-pages",
  "--disable-field-trial-config",
  "--metrics-recording-only",
  "--password-store=basic",
  "--disable-ipc-flooding-protection",
  "--mute-audio",
]
```

Extension loading stays per-spawn:

```typescript
`--disable-extensions-except=${extensionPath}`,
`--load-extension=${extensionPath}`,
```

### Avoid — instability or bot-detection risk

| Flag | Why skip |
| --- | --- |
| `--renderer-process-limit=1` | One renderer for all tabs/profiles; crash coupling |
| `--disable-site-isolation-trials` | Weakens cross-origin isolation; iframe-heavy sites |
| `--in-process-gpu` / `--disable-gpu` | Rendering/fingerprint changes |
| `--single-process` | Unsupported, crashes take down everything |
| `--aggressive-cache-discard` / tiny `--disk-cache-size` | Extra I/O, flaky load timing |
| `--enable-low-end-device-mode` | Removed from Chromium |
| `--no-zygote` | Needs `--no-sandbox` |
| `--disable-extensions` | Breaks tx |

### Flags vs architecture (summary)

| Lever | RAM impact | Stability |
| --- | --- | --- |
| Shared user-data-dir + profile-directory | Large | Same Chrome behavior per profile |
| Stable housekeeping flags | Small | High (Playwright-proven) |
| Anti-throttle trio (existing) | Costs RAM | **Keep** — automation reliability |
| Aggressive process/GPU/isolation flags | Uncertain | **Avoid** |

**Recommendation:** multi-profile refactor first, then add the stable housekeeping list above. No renderer/GPU/site-isolation tuning unless measurement on real tiket flows proves it safe.

---

## Manual verification (fish)

Cookie isolation between profiles:

```fish
set HELIUM (command -v helium)
set SHARED /tmp/tx-profile-test-(random)

$HELIUM --user-data-dir=$SHARED --profile-directory=a --no-first-run \
  'https://httpbin.org/cookies/set?tx_profile=a&path=/'

$HELIUM --user-data-dir=$SHARED --profile-directory=b --no-first-run \
  'https://httpbin.org/cookies'
# → {} (empty)

$HELIUM --user-data-dir=$SHARED --profile-directory=a --no-first-run \
  'https://httpbin.org/cookies'
# → {"tx_profile": "a"}
```

Tabs do **not** isolate (same profile, new tab → cookie visible).

---

## Open work

- [ ] Refactor `BrowserManager` to shared user-data-dir + per-spawn `--profile-directory`
- [ ] Update kill/cleanup for profile-scoped teardown
- [ ] Re-run `scripts/test-profiles.fish` with extension loaded and a tiket URL
- [ ] Add stable housekeeping flags to `browser.ts` (no renderer/GPU/isolation flags)
