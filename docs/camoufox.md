# Camoufox + Node.js Integration Guide

Notes from research and source-code exploration (camoufox repo + [camoufox-js](https://github.com/apify/camoufox-js)). Covers official support, stealth, server mode, persistent profiles, `launchOptions`, and embedding in an app.

---

## Table of contents

1. [Official JavaScript library?](#official-javascript-library)
2. [Remote server mode & stealth](#remote-server-mode--stealth)
3. [Installing with uv / CLI](#installing-with-uv--cli)
4. [Release builds & server mode](#release-builds--server-mode)
5. [Browser user profiles (persistent context)](#browser-user-profiles-persistent-context)
6. [Playwright + executable path only](#playwright--executable-path-only)
7. [What `launchOptions` does](#what-launchoptions-does)
8. [Best option for Node.js + persistent profile](#best-option-for-nodejs--persistent-profile)
9. [Embedding in your app](#embedding-in-your-app)
10. [Quick reference](#quick-reference)

---

## Official JavaScript library?

**No.** Camoufox does not ship an official first-party JavaScript/Node library.

| Component | Official? |
|-----------|-----------|
| Python package (`pip install camoufox`) | Yes — [camoufox.com/python](https://camoufox.com/python/) |
| Alpha builds | [`cloverlabs-camoufox`](https://pypi.org/project/cloverlabs-camoufox/) on PyPI |
| Node via `camoufox server` + Playwright `connect()` | Yes (supported pattern) |
| [`camoufox-js`](https://www.npmjs.com/package/camoufox-js) on npm | No — community port by Apify |

The main repo (`pythonlib/`) is Python-only. Docs and README point to the PyPI package for fingerprint injection, browser fetch, and CLI.

### Practical Node.js options

1. **Remote Playwright server (official path)** — launch from Python, connect from Node:
   ```bash
   camoufox server
   ```
   ```javascript
   import { firefox } from 'playwright-core';
   const browser = await firefox.connect('ws://...'); // endpoint printed by server
   ```

2. **Community npm package** — `camoufox-js` reimplements the Python wrapper in JS (does not call Python):
   ```bash
   npm install camoufox-js playwright-core
   npx camoufox-js fetch
   ```

---

## Remote server mode & stealth

### Does connecting over the server compromise stealth?

**No** — not at the browser level. The target page still sees the same patched Camoufox (C++ fingerprint spoofing, sandboxed Playwright page agent, Juggler isolation). The WebSocket is a control channel between your client and Playwright; websites cannot see it.

### What does change vs direct Python usage?

| Concern | Server mode |
|---------|-------------|
| Playwright/Juggler stealth | Same |
| Fingerprint at launch | Generated once when server starts |
| Fingerprint rotation | **One browser per server** — restart server for a new fingerprint ([docs](https://camoufox.com/python/remote-server/)) |
| Per-context fingerprints (`NewContext`) | Python / cloverlabs feature — not automatic from bare Node `connect()` |
| Stability | Marked **experimental** (undocumented Playwright `launchServer` hack) |

### Server CLI

```bash
camoufox server
# or
python -m camoufox server
```

Bare CLI uses defaults. For `headless`, `geoip`, `proxy`, etc., use Python:

```python
from camoufox.server import launch_server

launch_server(headless=True, geoip=True, proxy={"server": "http://..."})
```

Connect from Node with **`firefox.connect()`** (Juggler, not CDP / not Puppeteer).

### Installing with uv

Yes — normal PyPI package:

```bash
# global CLI
uv tool install "camoufox[geoip]"
camoufox fetch
camoufox server

# in a project
uv add "camoufox[geoip]"
uv run camoufox fetch
uv run camoufox server
```

`playwright` is a dependency of `camoufox`; you still need `camoufox fetch` once to download the browser binary.

---

## Release builds & server mode

### Can you download release builds and use them as a server?

**Yes, with a caveat:** the release is the **browser binary**; the server is still launched through the **Python wrapper** (or `camoufox-js`), which wires Playwright's `launchServer` to that binary and injects fingerprint config.

```bash
camoufox sync
camoufox fetch
camoufox fetch official/stable/135.0.1-beta.24
camoufox list all
```

You **cannot** run the downloaded binary alone as a Playwright WebSocket server. Something must call Playwright's server launcher and pass `CAMOU_CONFIG` (fingerprints, fonts, WebGL, etc.).

```python
from camoufox.server import launch_server

launch_server(
    browser="official/stable/135.0.1-beta.24",
    headless=True,
    geoip=True,
    fingerprint_preset=True,
)
```

Or point at an extracted binary:

```python
launch_server(executable_path="/path/to/camoufox-bin")
```

### “Profiles” — what that can mean

| Profile type | Supported? | How |
|--------------|------------|-----|
| Browser version | Yes | `camoufox fetch <version>`, `browser=...`, or `executable_path=...` |
| Fingerprint at server start | Yes | `launch_server(fingerprint_preset=True)`, preset dict, or `config={...}` |
| OS / proxy / geo | Yes | `os=`, `proxy=`, `geoip=True` on `launch_server()` |
| Multiple fingerprints on one server | Partially | Per-context via init scripts on newer builds; not ergonomic from Node |
| Firefox `profiles.ini` user profiles | No | Not a Camoufox concept; Playwright uses ephemeral/persistent contexts |

---

## Browser user profiles (persistent context)

Camoufox supports **Playwright persistent context** (like Chrome's `--user-data-dir`), not traditional Firefox profile directories.

### Python

```python
from camoufox.sync_api import Camoufox

with Camoufox(
    persistent_context=True,
    user_data_dir="/path/to/my-profile",
) as context:
    page = context.new_page()
```

Documented at [camoufox.com/python/usage](https://camoufox.com/python/usage/).

### Stable fingerprint + persistent profile

`user_data_dir` persists **cookies/localStorage**. It does **not** automatically lock the **fingerprint** — that is regenerated each launch unless you save and reuse `launch_options()`.

Pattern from [issue #38](https://github.com/daijro/camoufox/issues/38):

```python
import json, os
from camoufox.sync_api import Camoufox
from camoufox.utils import launch_options

profile_dir = "/path/to/my-profile"
fp_file = os.path.join(profile_dir, "fingerprint.json")
os.makedirs(profile_dir, exist_ok=True)

if os.path.exists(fp_file):
    opts = json.load(open(fp_file))
else:
    opts = launch_options(user_data_dir=profile_dir, os="macos")
    json.dump(opts, open(fp_file, "w"), indent=2)

with Camoufox(from_options=opts, persistent_context=True) as context:
    page = context.new_page()
```

### Session cookie gotcha

Some session cookies (no `Expires` / `Max-Age`) may not survive restarts. Export with `context.cookies()` and re-inject with `context.add_cookies()` if needed.

---

## Playwright + executable path only

**You can use Playwright from Node with Camoufox, but `executablePath` alone is not enough.**

Camoufox stealth requires launch config, not just the binary:

- `CAMOU_CONFIG_1`, `CAMOU_CONFIG_2`, … — chunked JSON fingerprint via env vars
- `firefoxUserPrefs` — WebGL, WebRTC, etc.
- On Linux: `FONTCONFIG_PATH` / font bundle paths
- Optional: addons, proxy + geoip alignment

This **does not work** for stealth:

```javascript
import { firefox } from 'playwright-core';

await firefox.launch({
  executablePath: '/home/user/.cache/camoufox/camoufox-bin',
});
```

You get the Camoufox binary without fingerprint spoofing.

### Intended JS setup

```javascript
import { launchOptions } from 'camoufox-js';
import { firefox } from 'playwright-core';

const browser = await firefox.launch(
  await launchOptions({
    os: 'macos',
    headless: true,
    geoip: true,
    proxy: { server: 'http://user:pass@host:port' },
  })
);
```

Use **`firefox.launch()` / `launchPersistentContext()`** — not Chromium, not Puppeteer/CDP.

---

## What `launchOptions` does

`launchOptions()` (JS) / `launch_options()` (Python) is a **config builder**. It does not launch the browser. It returns an object Playwright understands.

### Architecture (camoufox-js)

```
Camoufox({ ... })          → sync_api.ts
  └─ NewBrowser()          → sync_api.ts
       └─ launchOptions()  → utils.ts
       └─ firefox.launch() or launchPersistentContext()
```

### Output shape

```javascript
{
  executablePath: "/path/to/camoufox-bin",
  headless: false,
  env: {
    CAMOU_CONFIG_1: "{...chunk of JSON...}",
    CAMOU_CONFIG_2: "...",
    FONTCONFIG_PATH: "...",   // Linux only
  },
  firefoxUserPrefs: {
    "webgl.force-enabled": true,
    // ...
  },
  args: [],
  proxy: { server: "...", username: "...", password: "..." },
}
```

The Camoufox binary reads `CAMOU_CONFIG_*` at startup and applies C++-level spoofing before any page JavaScript runs.

### Internal pipeline (summary)

1. **Generate or accept fingerprint** — BrowserForge (`fingerprint-generator` in JS); map to Camoufox keys via `browserforge.config.ts`; patch Firefox version in UA to match installed binary.
2. **Enrich config** — fonts, WebGL (`sampleWebGL`), canvas noise, geoip/timezone/locale, addons, humanize cursor, random seeds.
3. **Build Firefox prefs** — `block_webrtc`, `block_webgl`, `block_images`, `disable_coop`, cache prefs, etc.
4. **Validate** — against `properties.json` from the browser bundle.
5. **Serialize to env vars** — JSON → `CAMOU_CONFIG_1`, `CAMOU_CONFIG_2`, … (2047 chars/chunk on Windows, 32767 elsewhere).
6. **Resolve binary** — `launchPath()` → `~/.cache/camoufox/camoufox-bin` unless `executable_path` is set.
7. **Return Playwright launch options.**

### Mental model

```
Playwright alone       → drives a browser
Camoufox binary alone  → can spoof, but needs config at startup
launchOptions()        → tells the binary who to pretend to be
```

### Not included in camoufox-js (vs Python / cloverlabs)

- `NewContext` / per-context fingerprint init scripts
- `fingerprint_preset` bundled real-world presets
- Per-context rotation in one process (Python/cloverlabs territory)

---

## Best option for Node.js + persistent profile

Verified against camoufox-js source and tests (`test/basics.test.ts`).

### Options ranked

| Approach | Persistent cookies | Stable fingerprint | Full stealth | Verdict |
|----------|-------------------|--------------------|--------------|---------|
| **`NewBrowser` + saved `launchOptions`** | Yes | Yes | Yes | **Best** |
| **`launchOptions` + `launchPersistentContext`** | Yes | Yes (if opts saved) | Yes | Same, more manual |
| **`Camoufox({ user_data_dir })`** | Yes | **No** | Yes | OK for cookies-only |
| **`launchServer` + `connect`** | No | No | Yes | Wrong for profiles |
| **`executablePath` only** | Maybe | No | No | Don't use |

### Why `Camoufox({ user_data_dir })` alone is insufficient

The repo test **"Persistent context works"** confirms cookies survive across restarts with the same `user_data_dir`.

The test **"fingerprint differs between launches"** confirms each `Camoufox()` call runs `launchOptions()` fresh → new UA, screen, WebGL, seeds. Cookies persist but **identity changes** — bad for anti-bot consistency.

Each `Camoufox()` call regenerates `fromOptions` unless you bypass it via `NewBrowser`.

### Recommended pattern

```javascript
import fs from 'node:fs';
import path from 'node:path';
import { firefox } from 'playwright-core';
import { NewBrowser, launchOptions } from 'camoufox-js';

async function openProfile(profileDir, camoufoxOpts = { os: 'linux', headless: true }) {
  fs.mkdirSync(profileDir, { recursive: true });
  const optsFile = path.join(profileDir, 'launch-options.json');

  let launchOpts;
  if (fs.existsSync(optsFile)) {
    launchOpts = JSON.parse(fs.readFileSync(optsFile, 'utf8'));
  } else {
    launchOpts = await launchOptions(camoufoxOpts);
    fs.writeFileSync(optsFile, JSON.stringify(launchOpts, null, 2));
  }

  // Returns BrowserContext when userDataDir is set
  return NewBrowser(firefox, camoufoxOpts.headless ?? false, launchOpts, profileDir);
}

// usage
const context = await openProfile('./profiles/account-a', { os: 'macos', headless: true });
const page = context.pages()[0] ?? await context.newPage();
```

### Multiple profiles

```
profiles/
  account-a/
    launch-options.json   ← fingerprint frozen on first run
    cookies.sqlite        ← Playwright manages this
  account-b/
    launch-options.json
    cookies.sqlite
```

Pin `os` per profile on first `launchOptions()` call. Prefer running fingerprints that match the host OS (Camoufox docs warn against cross-OS impersonation).

### Equivalent manual form

```javascript
import { launchOptions } from 'camoufox-js';
import { firefox } from 'playwright-core';

const opts = JSON.parse(fs.readFileSync('./profiles/account-a/launch-options.json'));
const context = await firefox.launchPersistentContext('./profiles/account-a', opts);
```

Same as `NewBrowser`, minus built-in virtual display handling (`headless: 'virtual'` on Linux).

---

## Embedding in your app

### Reuse `launchOptions`?

**Yes.** Save once per profile directory, reuse on every launch (see pattern above).

### Fetch browser yourself (no CLI)?

**Yes.** You do not need `npx camoufox-js fetch`. The CLI:

1. Calls `https://api.github.com/repos/daijro/camoufox/releases`
2. Finds asset: `camoufox-{version}-{release}-{os}.{arch}.zip`  
   Example: `camoufox-135.0.1-beta.24-lin.x86_64.zip`
3. Extracts to `~/.cache/camoufox`
4. Writes `version.json`: `{ "version": "135.0.1", "release": "beta.24" }`

**Download the full zip, not just the binary.** Required bundle contents:

| File | Why |
|------|-----|
| `camoufox-bin` / `.exe` / `Camoufox.app` | Browser executable |
| `properties.json` | Config validation in `launchOptions` |
| `fontconfig/{linux,mac,win}/` | Font spoofing (critical on Linux) |
| Bundled fonts, addons dir, etc. | OS-consistent fingerprint |

### Recommended embed setup

```javascript
// Prevent camoufox-js from auto-downloading at runtime
process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = '1';
```

Bootstrap on app init:

```javascript
async function provisionCamoufox(installDir /* default: ~/.cache/camoufox */) {
  // 1. Download zip from GitHub releases API
  // 2. Extract entire zip to installDir
  // 3. Write version.json
  // 4. chmod +x camoufox-bin (linux/mac)
}
```

Then use `launchOptions()` without custom paths (if installed to default cache), or pass `executable_path` with caveats below.

Optional extras:

- **GeoIP** (`geoip: true`) — needs `GeoLite2-City.mmdb` in install dir
- **Default addons** (uBlock) — downloaded to `addons/` on first CLI fetch; optional for embed

### Custom install path caveats

If you pass `executable_path` outside the default cache:

- `properties.json` is read from the directory containing the binary — OK
- **Linux `FONTCONFIG_PATH` still resolves via hardcoded `INSTALL_DIR` (`~/.cache/camoufox`)** — not next to your custom binary

Simplest embed path: extract the **full zip to `~/.cache/camoufox`**, or symlink your app directory there.

If cache has no `version.json`, pass `ff_version` explicitly:

```javascript
await launchOptions({ ff_version: 135, os: 'linux', headless: true });
```

Otherwise `installedVerStr()` fails when building UA strings.

### Embed checklist

```
[ ] npm install camoufox-js playwright-core
[ ] Download full platform zip from GitHub releases (not binary alone)
[ ] Extract to ~/.cache/camoufox + write version.json
[ ] Set PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
[ ] Per profile: save launch-options.json once, reuse forever
[ ] Launch via NewBrowser(firefox, headless, savedOpts, profileDir)
```

No CLI required at runtime.

---

## Quick reference

### Dependencies

```bash
npm install camoufox-js playwright-core
```

One-time browser provision (or your own GitHub download):

```bash
npx camoufox-js fetch
```

### Minimal launch (ephemeral)

```javascript
import { Camoufox } from 'camoufox-js';

const browser = await Camoufox({ os: 'macos', headless: true });
const page = await browser.newPage();
```

### Persistent profile + stable fingerprint (recommended for apps)

```javascript
import { NewBrowser, launchOptions } from 'camoufox-js';
import { firefox } from 'playwright-core';
// + save/load launch-options.json per profile (see above)
```

### Python equivalent (persistent + stable fingerprint)

```python
from camoufox.sync_api import Camoufox
from camoufox.utils import launch_options
# + save/load opts JSON per profile
```

### What to avoid for Node + profiles

- `launchServer` + `connect` — no persistent context
- `executablePath` only — no `CAMOU_CONFIG_*`, no real stealth
- `Camoufox({ user_data_dir })` without saved opts — cookies yes, fingerprint rotates every launch
- Chromium / Puppeteer — Camoufox is Firefox + Juggler only

### Links

- [Camoufox Python docs](https://camoufox.com/python/)
- [Remote server docs](https://camoufox.com/python/remote-server/)
- [camoufox-js on GitHub](https://github.com/apify/camoufox-js)
- [Persistent fingerprint discussion (issue #38)](https://github.com/daijro/camoufox/issues/38)
- [user_data_dir discussion (issue #56)](https://github.com/daijro/camoufox/issues/56)

---

*Generated from a working session exploring the camoufox repo and camoufox-js v0.10.2 source at `/tmp/camoufox-js`.*
