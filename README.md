# tx

Browser automation for [tiket.com](https://www.tiket.com) checkout, built as a CLI + browser extension pair. The CLI launches real browser instances (Helium recommended), loads the extension, and coordinates customer data across one or many browsers. The extension drives the checkout flow in-page so automation looks like normal browsing rather than headless scripting.

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/E1E519XS7W)

## Overview

Typical flow:

1. Prepare a customer list (CSV or JSON).
2. Configure the CLI (browser executable).
3. Optionally create named login templates (`--template`).
4. Run `tx tiket start` with an event URL.

The extension also handles TTM wait rooms (`wait.thaiticketmajor.com`) — auto-clicks human-verification prompts.

## Prerequisites

- **[Helium](https://github.com/imputnet/helium)** (recommended): download from [releases](https://github.com/imputnet/helium/releases), put `helium` on your `PATH` or set `browserExecutable` in config. Any Chromium browser with `--load-extension` support can work.
- **Customer data**: CSV export or JSON file (see [Customer data](#customer-data)).

## Installation

Download a release from [GitHub Releases](https://github.com/ericc-ch/tx/releases) (`tx-linux-x64`, `tx-win-x64.exe`). Keep the binary and bundled `extension/` folder together:

```
<tx-binary-dir>/
├── tx-linux-x64          # or tx-win-x64.exe
└── extension/
    └── manifest.json     # required — tx fails at startup if missing
```

Run from that directory or add it to your `PATH`. On first run, tx creates a default `config.json`.

From source: see [CONTRIBUTING.md](CONTRIBUTING.md).

## Configuration

```bash
tx debug paths    # resolved paths on this machine
tx debug config open
```

On Linux, paths are typically:

| Path                                                        | Purpose                    |
| ----------------------------------------------------------- | -------------------------- |
| `~/.config/tx-nodejs/config.json`                           | Main config                |
| `~/.local/share/tx-nodejs/user-data-dir/`                   | Browser profiles (default) |
| `~/.local/share/tx-nodejs/user-data-dir/__template-<name>/` | Named login templates      |

```json
{
  "browserExecutable": "helium",
  "userDataDir": "/optional/custom/path",
  "copyUserDataDirToTmp": false
}
```

| Field                  | Description                                                                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `browserExecutable`    | Browser binary. `tx tiket start` passes `--load-extension` and the event URL; template commands use `--user-data-dir` only. Defaults to `helium`.   |
| `userDataDir`          | Chromium profile root. Instance profiles and `__template-<name>` directories live here. Relative paths resolve from the config file directory.        |
| `copyUserDataDirToTmp` | When `true`, copies `userDataDir` to a temp directory at startup (useful for testing or read-only stores).                                           |

Field descriptions also appear in `tx debug config schema`.

## Customer data

Each customer is one checkout attempt, keyed by `email:nik` and claimed one at a time per browser.

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

| Field           | Notes                                                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `categories`    | Tried in order; case-insensitive substring match on package titles. Required, non-empty.                                     |
| `phone`         | Digits only, no leading `0` (e.g. `81234567890`).                                                                            |
| `paymentMethod` | Exact Tiket label (e.g. `"BCA Virtual Account"`).                                                                            |
| `membershipCode`| Presale code; empty string discards the customer on presale pages.                                                           |

`birthDate` and `day` are stored from CSV but not used by the current checkout flow (event day comes from the start URL).

Convert spreadsheet exports:

```bash
tx server csv-to-json customers.csv
```

CSV uses Indonesian column headers (`Nama Lengkap`, `Email`, `NIK/KTP`, etc.). Normalization handles phone leading zeros, date formats, payment aliases (`BCA` → `BCA Virtual Account`), and duplicate categories.

Full field reference: `tx debug customer schema` or `fixtures/customer-data.json`.

## Quick start

```bash
tx server csv-to-json customers.csv          # if needed

tx tiket template create team-alpha          # optional — log into Tiket, close browser, confirm save

tx tiket start \
  --customer-data ./customers.json \
  --template team-alpha \
  -n 3 \
  "https://www.tiket.com/to-do/your-event"
```

Runs until Ctrl+C. Each browser opens the event URL in a 390×844 window with the extension loaded.

## `tx tiket start`

```bash
tx tiket start [flags] <url>
```

Run `tx tiket start --help` for flags and examples.

### Pool modes

**Local** — in-process pool on one machine:

```bash
tx tiket start --customer-data ./customers.json -n 5 "https://www.tiket.com/to-do/my-event"
```

**Remote** — shared pool across machines:

```bash
# pool host
tx server start --customer-data ./customers.json --port 3847

# operators (--server-url accepts /rpc or not; tx appends it when missing)
tx tiket start --server-url http://192.168.1.10:3847 -n 10 "https://www.tiket.com/to-do/my-event"
```

The pool server hot-reloads the customer file; settled and in-flight customers are not duplicated.

### Runtime

1. Local operator HTTP server on `127.0.0.1` (ephemeral port).
2. Each browser gets a fresh profile, or a copy of `--template <name>` when the template exists.
3. Extension claims a customer and runs overview → packages → order → payment → Discord alert.
4. Claims expire after 30 minutes and return to the pool.

## Templates

Named Chromium profiles at `<userDataDir>/__template-<name>/`. Names: lowercase letters, digits, hyphens, max 32 characters, must start and end with a letter or digit.

| Command                         | Description                                              |
| ------------------------------- | -------------------------------------------------------- |
| `template create <name>`        | Log into Tiket in a temp browser, confirm save           |
| `template update <name>`        | Open existing template to refresh cookies                |
| `template list`                 | List saved names                                         |
| `template delete <name> [-f]`   | Remove template (prompts unless `--force`)               |

Pass `--template <name>` to `tx tiket start` to copy into each new browser. Omitted or missing templates start fresh.

## Commands

```bash
tx --help
tx readme
tx tiket start --help
tx tiket template --help
tx server start --help
tx debug paths
```

| Command              | Description                                      |
| -------------------- | ------------------------------------------------ |
| `tx tiket start`     | Operator server + browser spawning + autobuy     |
| `tx tiket template`  | Create, update, list, delete login templates     |
| `tx server start`    | Shared customer pool RPC server                  |
| `tx server csv-to-json` | Spreadsheet CSV → customer JSON               |
| `tx debug`           | Paths, config, JSON schemas                      |
| `tx readme`          | Print this guide                                 |

## References

- [CONTRIBUTING.md](CONTRIBUTING.md) — development setup
- [Helium](https://github.com/imputnet/helium) — recommended browser
- [Repository](https://github.com/ericc-ch/tx) — source and issues
