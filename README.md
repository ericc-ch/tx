# tx

Tiket eXtension — browser automation for [tiket.com](https://www.tiket.com) checkout, built as a CLI + browser extension pair. The CLI launches real browser instances (Helium recommended), loads the extension, and coordinates customer data across one or many browsers. The extension drives the checkout flow in-page so automation looks like normal browsing rather than headless scripting.

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/E1E519XS7W)

## Overview

tx is split into three pieces:

| Component                  | Role                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| **CLI** (`tx`)             | Spawns browsers, runs a local operator RPC server, forwards logs, and sends Discord alerts |
| **Extension**              | Content scripts on tiket.com that fill forms, select packages, and complete payment steps  |
| **Pool server** (optional) | Standalone RPC server that hands out customers to multiple operators                       |

Typical flow:

1. Prepare a customer list (CSV or JSON).
2. Configure the CLI (browser executable, Discord webhook).
3. Optionally create a browser profile template (logged-in Tiket session shared across instances).
4. Run `tx tiket start` with an event URL — the CLI opens browser(s), the extension claims a customer and runs the autobuy pipeline.

The extension also handles:

- **Queue pages** (`queue.tiket.com`) — waits until your queue number drops below 1,000, then posts a Discord alert with the transfer URL.
- **TTM wait room** (`wait.thaiticketmajor.com`) — auto-clicks human-verification prompts.

## Prerequisites

- **[Helium](https://github.com/imputnet/helium)** — recommended browser. tx defaults to the `helium` executable on your `PATH`. Any Chromium-based browser with `--load-extension` support can work if you set `browserExecutable` in config.
- **Discord webhook URL** — required for payment confirmations and queue alerts. Create one in your Discord server under _Server Settings → Integrations → Webhooks_.
- **Customer data** — a CSV export or JSON file (see [Customer data](#customer-data)).

For development or building from source, you also need [Bun](https://bun.sh) 1.3+.

## Installation

### Pre-built binary (recommended)

Build release binaries from the repo (requires Bun):

```bash
git clone https://github.com/ericc-ch/tx.git
cd tx
bun install
cp packages/cli/.env.example packages/cli/.env.production
# Edit .env.production and set DISCORD_WEBHOOK_URL
bun run --filter @tx/cli build
```

Binaries land in `packages/cli/dist/`:

- `tx-linux-x64` — Linux x64
- `tx-win-x64.exe` — Windows x64

Copy the binary for your platform somewhere on your `PATH` (or run it directly). The extension is bundled inside the binary — no separate install step.

On first run, tx creates a default `config.json` (see [Configuration](#configuration)).

### Install Helium

Download Helium from the [releases page](https://github.com/imputnet/helium/releases) and make sure the `helium` command is on your `PATH`.

On Linux, that usually means extracting the archive and either:

- placing the binary in a directory on your `PATH`, or
- setting `browserExecutable` in config to the full path of the Helium binary.

Verify Helium is reachable:

```bash
helium --version
```

### From source (development)

```bash
git clone https://github.com/ericc-ch/tx.git
cd tx
bun install
cp packages/cli/.env.example packages/cli/.env.dev
# Edit .env.dev and set DISCORD_WEBHOOK_URL
```

Start the extension in watch mode (required for `bun run dev` — the CLI loads from `packages/extension/.output/chrome-mv2-dev/`):

```bash
bun run --filter @tx/extension dev
```

In another terminal, run the CLI:

```bash
bun run --filter @tx/cli dev -- <subcommand>
# e.g.
bun run --filter @tx/cli dev -- tiket start --customer-data ./customers.json "https://www.tiket.com/to-do/..."
```

Dev mode loads `packages/cli/.env.dev` for `DISCORD_WEBHOOK_URL`.

## Configuration

On first launch, tx writes a default config file. Find exact paths on your machine:

```bash
tx debug paths
```

On Linux this is typically:

| Path                                                         | Purpose                    |
| ------------------------------------------------------------ | -------------------------- |
| `~/.config/tx-nodejs/config.json`                            | Main config                |
| `~/.local/share/tx-nodejs/user-data-dir/`                    | Browser profiles (default) |
| `~/.local/share/tx-nodejs/user-data-dir/__profile-template/` | Shared login template      |

### `config.json`

```json
{
  "browserExecutable": "helium",
  "userDataDir": "/optional/custom/path",
  "copyUserDataDirToTmp": false
}
```

| Field                  | Description                                                                                                                                                                                                                                                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `browserExecutable`    | **Required.** Command or absolute path to the browser binary. Every `tx tiket start` and `tx tiket template` invocation spawns this executable with `--user-data-dir`, `--load-extension`, and the event URL. Defaults to `helium`.                                                                                          |
| `userDataDir`          | Optional. Chromium profile root. tx creates one subdirectory per browser instance under this path and copies `__profile-template` into each new profile when a template exists. Relative paths resolve from the config file directory; absolute paths are used as-is. Defaults to the app data directory (`tx debug paths`). |
| `copyUserDataDirToTmp` | Optional. When `true`, copies `userDataDir` to a temp directory at startup and runs against the copy. The configured directory on disk is left unchanged — useful for testing or read-only profile stores.                                                                                                                   |
| `$schema`              | Optional. JSON Schema URL for editor tooling only; tx ignores it at runtime.                                                                                                                                                                                                                                                 |

Field descriptions are also embedded in the schema (Effect `annotate` / `annotateKey`) and appear in generated JSON Schema:

```bash
tx debug config schema
```

Open the config file in your default editor:

```bash
tx debug config open
```

### Discord webhook

`DISCORD_WEBHOOK_URL` must be set:

- **Pre-built binary** — baked in at compile time via `packages/cli/.env.production`.
- **Dev mode** — loaded from `packages/cli/.env.dev`.

Copy `packages/cli/.env.example` as a starting point:

```
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/0000000000000000000/your-token-here
```

## Customer data

Each customer is one checkout attempt. Customers are keyed by `email:nik` and claimed one at a time per browser.

### JSON format

```json
[
  {
    "name": "Jane Doe",
    "email": "jane@example.com",
    "birthDate": "2002-01-15",
    "gender": "female",
    "nik": "1000000000000001",
    "phone": "81100000001",
    "categories": ["cat 1"],
    "ticketCount": 2,
    "day": "day 1",
    "membershipCode": "BZ000000001",
    "paymentMethod": "BCA Virtual Account"
  }
]
```

| Field            | Format                 | How tx uses it                                                                                                                                                                                                                      |
| ---------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`           | Full legal name        | Filled into the contact detail form on the **order** page.                                                                                                                                                                          |
| `email`          | Email address          | Filled on the order page; sent in Discord payment alerts; with `nik` forms the pool identity (`email:nik`) so each person is only claimed once.                                                                                     |
| `birthDate`      | `YYYY-MM-DD`           | Stored and normalized from CSV. Not filled by the extension on the current Tiket checkout flow — keep accurate for your records.                                                                                                    |
| `gender`         | `female` or `male`     | Selects salutation on the order page (Ms/Nona vs Mr/Tuan). Normalized to lowercase.                                                                                                                                                 |
| `nik`            | KTP / national ID      | Filled into the visitor detail sheet on the **order** page. Combined with `email` for pool deduplication.                                                                                                                           |
| `phone`          | Digits, no leading `0` | Filled into the contact phone field (e.g. `81234567890`, not `081234567890`).                                                                                                                                                       |
| `categories`     | String array           | **Packages** page: tried in order; each entry is matched as a case-insensitive substring of a package card title. First available match is ordered. When empty, falls back to `["cat 6", "last forever fan", "festival", "cat 1"]`. |
| `ticketCount`    | Positive integer       | **Packages** page: quantity set before clicking Book/Pesan.                                                                                                                                                                         |
| `day`            | e.g. `"day 1"`         | Stored and normalized from CSV. Event day is determined by the start URL you pass to `tx tiket start`, not this field.                                                                                                              |
| `membershipCode` | Presale code or `""`   | **Packages** page: entered when a presale verification flow is detected. Required on presale pages — an empty code discards the customer.                                                                                           |
| `paymentMethod`  | Exact Tiket label      | **Payment** page: clicked by exact text match (e.g. `"BCA Virtual Account"`, `"Mandiri Virtual Account"`).                                                                                                                          |

See `fixtures/customer-data.json` for a full example. Print the annotated JSON Schema (same descriptions as the source schema):

```bash
tx debug customer schema
```

### CSV format

tx can convert a spreadsheet export to JSON:

```bash
tx server csv-to-json customers.csv
# writes customers.json next to the CSV by default

tx server csv-to-json customers.csv /path/to/output.json
```

Expected CSV columns (Indonesian headers):

| Column                                | Maps to                        |
| ------------------------------------- | ------------------------------ |
| `Nama Lengkap`                        | `name`                         |
| `Email`                               | `email`                        |
| `Tanggal Lahir`                       | `birthDate`                    |
| `Gender`                              | `gender`                       |
| `NIK/KTP`                             | `nik`                          |
| `Nomor Telepon (contoh: 81234567890)` | `phone`                        |
| `Kategori Ticket`                     | `categories` (comma-separated) |
| `Jumlah Ticket`                       | `ticketCount`                  |
| `Day (contoh: day 1)`                 | `day`                          |
| `Kode Membership (Presale Only)`      | `membershipCode`               |
| `Metode Pembayaran`                   | `paymentMethod`                |

CSV normalization handles common quirks automatically — phone leading zeros, `M/D/YYYY` dates, `BCA` → `BCA Virtual Account`, `VA MANDIRI` → `Mandiri Virtual Account`, duplicate categories, etc.

## Quick start

```bash
# 1. Convert customer spreadsheet (if needed)
tx server csv-to-json customers.csv

# 2. Create a template profile (log into Tiket once, close browser, confirm save)
tx tiket template create

# 3. Start automation
tx tiket start \
  --customer-data ./customers.json \
  --browser-count 3 \
  "https://www.tiket.com/to-do/your-event"
```

The CLI prints the operator port, spawns browsers, and keeps running until you stop it (Ctrl+C). Each browser opens the event URL in a mobile-sized window (390×844) with the extension loaded.

## `tx tiket start`

Start the operator server and spawn browser instances.

```bash
tx tiket start [flags] <url>
```

### Arguments

| Argument | Description                                                                                                                                           |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `url`    | Tiket event URL opened in every browser. Use the overview page (`/to-do/...`). The extension drives overview → packages → order → payment from there. |

### Flags

| Flag              | Alias | Default | Description                                                                                                                                                                                   |
| ----------------- | ----- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--customer-data` |       | —       | Customer JSON file. Starts an in-process pool on this machine. Required unless `--server-url` is set. Mutually exclusive with `--server-url`.                                                 |
| `--server-url`    |       | —       | Remote pool server base URL (see [Distributed pool](#distributed-pool)). Operators claim customers over HTTP RPC; `/rpc` is appended when omitted. Mutually exclusive with `--customer-data`. |
| `--browser-count` | `-n`  | `1`     | Browser instances to spawn. Each claims customers independently. Spawn concurrency is capped at ~¼ of CPU cores.                                                                              |

Run `tx tiket start --help` for embedded examples.

### Customer pool modes

**Local file (single machine)** — embeds the pool in-process. Good for one operator running a few browsers:

```bash
tx tiket start \
  --customer-data ./customers.json \
  -n 5 \
  "https://www.tiket.com/to-do/my-event"
```

**Remote pool server (multiple machines)** — operators connect to a shared pool server. Good when several people or machines share one customer list:

```bash
# Machine A — run the pool server
tx server start --customer-data ./customers.json --port 3847

# Machine B, C, … — connect operators
tx tiket start \
  --server-url http://192.168.1.10:3847 \
  -n 10 \
  "https://www.tiket.com/to-do/my-event"
```

`--server-url` accepts either `http://host:port` or `http://host:port/rpc`; tx appends `/rpc` when missing.

### Examples

Single browser, local customer file:

```bash
tx tiket start \
  --customer-data ~/tx/customers.json \
  "https://www.tiket.com/to-do/babymonster-jakarta"
```

Five browsers, debug logging:

```bash
tx tiket start \
  --customer-data ./customers.json \
  -n 5 \
  --log-level debug \
  "https://www.tiket.com/to-do/babymonster-jakarta"
```

Remote pool, custom browser path in config:

```json
{
  "browserExecutable": "/usr/local/bin/helium",
  "userDataDir": "/mnt/ssd/tx-profiles"
}
```

```bash
tx tiket start \
  --server-url http://10.0.0.5:3847 \
  -n 20 \
  "https://www.tiket.com/to-do/my-event"
```

### What happens at runtime

1. tx starts a local operator HTTP server on `127.0.0.1` (ephemeral port).
2. For each browser, tx copies the template profile (if one exists), loads the extension, and opens the URL with an init payload in the query string.
3. The extension connects back to the operator RPC endpoint, claims a customer, and runs the autobuy pipeline:
   - **overview** → select day / continue
   - **packages** → pick category and quantity
   - **order** → fill attendee details
   - **payment** → select payment method
   - **payment-confirm** → capture VA screenshot and notify Discord
4. On success or discard, the customer is resolved back to the pool. In-flight claims expire after 30 minutes (local mode) and return to the pool.

Browsers are named randomly (e.g. `48291-1-crimson-river`) and cleaned up on exit.

## Template profiles

A template is a saved Chromium profile directory (`__profile-template`) copied into each new browser instance. Use it to share a Tiket login session (cookies, local storage) so every browser starts already authenticated.

### Create a template

```bash
tx tiket template create
```

1. A temporary browser opens.
2. Log into Tiket (and complete any captcha / 2FA).
3. Close the browser.
4. Confirm **Save as template?** at the prompt.

This replaces any existing template.

### Update a template

Refresh cookies or re-login without recreating from scratch:

```bash
tx tiket template update
```

Opens the existing template profile in your configured `userDataDir`. Close the browser when done — changes are saved in place.

If no template exists, browsers start with fresh profiles (you'll need to log in manually in each instance).

## Distributed pool

Run a standalone pool server when multiple operators share one customer list.

### Start the pool server

```bash
tx server start \
  --customer-data ./customers.json \
  --host 0.0.0.0 \
  --port 3847 \
  --claim-ttl-seconds 1800
```

| Flag                  | Default   | Description                                                                                                                    |
| --------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `--customer-data`     | —         | **Required.** Customer JSON file. Watched for changes; new rows hot-reload without duplicating settled or in-flight customers. |
| `--host`              | `0.0.0.0` | Bind address. `0.0.0.0` accepts LAN connections for remote operators.                                                          |
| `--port`              | `0`       | Listen port. `0` = ephemeral; check logs for the port to pass to `--server-url`.                                               |
| `--claim-ttl-seconds` | `1800`    | Seconds before an unresolved in-flight claim returns to the pool (default 30 min).                                             |

Run `tx server start --help` for embedded examples.

The pool server watches the customer file for changes and hot-reloads new rows (existing settled or in-flight customers are not duplicated).

### Connect operators

```bash
tx tiket start --server-url http://pool-host:3847 -n 10 "<event-url>"
```

## Discord notifications

tx sends two kinds of alerts via the configured webhook:

| Event               | Content                                                                                         |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| **Payment confirm** | Embed with customer email, payment method, VA number, and a screenshot of the confirmation page |
| **Queue alert**     | Transfer URL when queue position drops below 1,000 on `queue.tiket.com`                         |

Queue alerts are sent once per queue session (deduplicated in extension local storage).

## Command reference

Every command, flag, and argument has a description in source and in `--help` output. Run `tx <command> --help` (or `tx <command> <subcommand> --help`) for the canonical reference including examples.

```bash
tx --help
tx tiket start --help
tx server csv-to-json --help
```

### Global flags

Available on every subcommand:

| Flag            | Alias | Description                                                                                                                                                                          |
| --------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--help`        | `-h`  | Print help for the current command, including flags, arguments, and examples where defined.                                                                                          |
| `--version`     | `-v`  | Print the tx version and exit. Takes precedence over subcommands.                                                                                                                    |
| `--log-level`   |       | Minimum log level for CLI output: `all`, `trace`, `debug`, `info`, `warn`, `warning`, `error`, `fatal`, `none`. Extension logs are forwarded at the level captured at browser spawn. |
| `--completions` |       | Print a shell completion script. Choices: `bash`, `zsh`, `fish`, `sh`.                                                                                                               |

### `tx`

Root command. Subcommands: `tiket`, `server`, `debug`.

### `tx tiket`

Tiket.com automation — browser spawning, operator RPC, and profile templates.

| Subcommand        | Description                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start <url>`     | Start the local operator on localhost, spawn browsers with the extension, and run autobuy until stopped. See [`tx tiket start`](#tx-tiket-start). |
| `template`        | Manage the shared Chromium profile template (`__profile-template`).                                                                               |
| `template create` | Open a temp browser, log into Tiket, optionally save as the template (replaces existing).                                                         |
| `template update` | Open the existing template profile to refresh cookies or re-authenticate.                                                                         |

#### `tx tiket start` flags

| Flag                   | Alias | Default | Description                                                      |
| ---------------------- | ----- | ------- | ---------------------------------------------------------------- |
| `--customer-data FILE` |       | —       | Local customer JSON pool. Required unless `--server-url` is set. |
| `--server-url URL`     |       | —       | Remote `tx server start` pool. `/rpc` appended when missing.     |
| `--browser-count N`    | `-n`  | `1`     | Parallel browser instances.                                      |

#### `tx tiket start` arguments

| Argument | Description                              |
| -------- | ---------------------------------------- |
| `url`    | Tiket event overview URL (`/to-do/...`). |

### `tx server`

Shared customer pool RPC server. Also available standalone as `pool-server` from `@tx/pool-server`.

| Subcommand                     | Description                                                                                               |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `start`                        | Bind an HTTP server exposing `ClaimNext` / `Resolve` at `/rpc`. Watches the customer file for hot-reload. |
| `csv-to-json <input> [output]` | Convert spreadsheet CSV to customer JSON with normalization.                                              |

#### `tx server start` flags

| Flag                          | Default   | Description                                              |
| ----------------------------- | --------- | -------------------------------------------------------- |
| `--customer-data FILE`        | —         | **Required.** Customer JSON to load into the pool.       |
| `--host HOST`                 | `0.0.0.0` | Bind address for remote operators.                       |
| `--port PORT`                 | `0`       | Listen port (`0` = ephemeral).                           |
| `--claim-ttl-seconds SECONDS` | `1800`    | TTL for in-flight claims before they return to the pool. |

#### `tx server csv-to-json` arguments

| Argument | Description                                                               |
| -------- | ------------------------------------------------------------------------- |
| `input`  | Input CSV path (Indonesian column headers).                               |
| `output` | Optional output JSON path (default: same basename as input with `.json`). |

### `tx debug`

Paths, resolved config, and JSON Schemas. Does not start browsers.

| Subcommand        | Description                                                                    |
| ----------------- | ------------------------------------------------------------------------------ |
| `paths`           | Print env-paths roots plus `configFilePath`, `userDataDir`, and `templateDir`. |
| `config`          | Print the resolved `config.json` as JSON.                                      |
| `config schema`   | Print `config.json` JSON Schema with per-field descriptions.                   |
| `config open`     | Open `config.json` in the OS default app.                                      |
| `customer`        | Customer data schema helpers.                                                  |
| `customer schema` | Print customer JSON file JSON Schema with per-field descriptions.              |

## Development

### Workspace layout

| Package                | Description                 |
| ---------------------- | --------------------------- |
| `packages/cli`         | `tx` CLI binary             |
| `packages/extension`   | WXT browser extension (MV2) |
| `packages/pool-server` | Customer pool RPC server    |
| `packages/schema`      | Shared RPC and data schemas |

### Common tasks

```bash
bun install                  # install all workspace deps
bun run check                # typecheck, test, lint, format
bun run --filter @tx/extension dev     # extension watch mode (for CLI dev)
bun run --filter @tx/extension build   # production extension build (used by release pipeline)
bun run --filter @tx/cli dev -- --help # run CLI in dev mode
bun run --filter @tx/cli build         # build release binaries
```

### Extension content scripts

| Entrypoint       | Matches                              | Purpose                                   |
| ---------------- | ------------------------------------ | ----------------------------------------- |
| `tiket.content`  | `*://www.tiket.com/*`                | Main autobuy pipeline                     |
| `queue.content`  | `*://queue.tiket.com/*`              | Queue position monitoring + Discord alert |
| `golive.content` | `*://wait.thaiticketmajor.com/view*` | TTM human-verification auto-click         |

Tests use real HTML fixtures under `fixtures/` (captured from production pages).

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  tx tiket start                                             │
│  ┌──────────────┐    RPC (/rpc)    ┌─────────────────────┐  │
│  │ Operator     │◄────────────────►│ Browser + Extension │  │
│  │ (local HTTP) │                  │ (Helium, MV2 ext)   │  │
│  └──────┬───────┘                  └─────────────────────┘  │
│         │                                                   │
│         ▼                                                   │
│  ┌──────────────┐         optional                          │
│  │ Pool         │◄──── tx server start (remote mode)        │
│  │ (in-process  │                                          │
│  │  or remote)  │                                           │
│  └──────────────┘                                           │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
   Discord webhook (payment + queue alerts)
```

RPC between extension and operator uses NDJSON over HTTP. The pool server exposes `ClaimNext` and `Resolve`; the operator exposes `ClaimCustomer`, `ResolveCustomer`, `PushLogs`, `ReportPaymentConfirm`, and `ReportQueueAlert`.

## References

- [Helium browser](https://github.com/imputnet/helium) — recommended Chromium fork
- [Helium releases](https://github.com/imputnet/helium/releases) — download binaries
- [Discord webhooks](https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks) — set up notifications
- [tiket.com](https://www.tiket.com) — target site
- [Repository](https://github.com/ericc-ch/tx) — source and issues
