# Contributing

Development setup and workspace reference for tx. For using the CLI and extension in production, see [README.md](README.md).

## Prerequisites

- **[Bun](https://bun.sh)** 1.3+
- Everything in [README — Prerequisites](README.md#prerequisites) (Helium, customer data)
- **Discord webhook URL** — required for payment confirmations. Create one in your Discord server under _Server Settings → Integrations → Webhooks_. See [Discord webhook](#discord-webhook) below.

## From source

```bash
git clone https://github.com/ericc-ch/tx.git
cd tx
bun install
cp packages/cli/.env.example packages/cli/.env.dev
# Edit .env.dev — see Discord webhook below
```

Start the extension in watch mode (required for `bun run dev` — see [Extension resolution](#extension-resolution)):

```bash
bun run --filter @tx/extension dev
```

In another terminal, run the CLI:

```bash
bun run --filter @tx/cli dev -- <subcommand>
# e.g.
bun run --filter @tx/cli dev -- tiket start --customer-data ./customers.json "https://www.tiket.com/to-do/..."
```

## Discord webhook

`DISCORD_WEBHOOK_URL` must be set before running or building the CLI:

- **Dev mode** — `packages/cli/.env.dev` (loaded by `bun run dev`)
- **Release build** — `packages/cli/.env.production` (baked into compiled binaries by `bun run --filter @tx/cli build`)

Copy `packages/cli/.env.example` as a starting point:

```
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/0000000000000000000/your-token-here
```

tx sends a **payment confirm** Discord alert: embed with customer email, payment method, VA number, and a screenshot of the confirmation page.

## Workspace layout

| Package                | Description                 |
| ---------------------- | --------------------------- |
| `packages/cli`         | `tx` CLI binary             |
| `packages/extension`   | WXT browser extension (MV2) |
| `packages/pool-server` | Customer pool RPC server    |
| `packages/schema`      | Shared RPC and data schemas |

## Common tasks

```bash
bun install                  # install all workspace deps
bun run check                # typecheck, test, lint, format
bun run --filter @tx/extension dev     # extension watch mode (for CLI dev)
bun run --filter @tx/extension build   # production extension → .output/chrome-mv2
bun run --filter @tx/cli dev -- --help # run CLI in dev mode
bun run --filter @tx/cli build         # release binaries → packages/cli/dist/
```

## Extension resolution

`resolveBrowserExtensionPath` (`packages/cli/src/lib/extension.ts`) checks paths in order and uses the first one where `manifest.json` exists:

| Priority | Path                                         | When                                                                                  |
| -------- | -------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1        | `packages/extension/.output/chrome-mv2-dev/` | Monorepo dev — extension watch must be running (`bun run --filter @tx/extension dev`) |
| 2        | `<dirname(process.execPath)>/extension/`     | Release binary — sidecar folder next to `tx-linux-x64` or `tx-win-x64.exe`            |

Workspace output wins when present, so `bun run --filter @tx/cli dev` does not need a copied `extension/` folder. Compiled binaries only check the sidecar path.

If neither location has `manifest.json`, browser commands fail with `ExtensionNotAvailable`.

## Release build

```bash
bun run --filter @tx/extension build
bun run --filter @tx/cli build
cp -r packages/extension/.output/chrome-mv2 packages/cli/dist/extension
```

Ship `packages/cli/dist/` as a unit: the platform binary plus `extension/` (with `manifest.json` at the root of that folder).

## Extension content scripts

| Entrypoint       | Matches                              | Purpose                                   |
| ---------------- | ------------------------------------ | ----------------------------------------- |
| `tiket.content`  | `*://www.tiket.com/*`                | Main autobuy pipeline             |
| `golive.content` | `*://wait.thaiticketmajor.com/view*` | TTM human-verification auto-click |

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
   Discord webhook (payment confirms)
```

RPC between extension and operator uses NDJSON over HTTP. The pool server exposes `ClaimNext` and `Resolve`; the operator exposes `ClaimCustomer`, `ResolveCustomer`, `PushLogs`, and `ReportPaymentConfirm`.

## Conventions

See [AGENTS.md](AGENTS.md) for workspace rules, testing philosophy, and Effect patterns.
