# Contributing

Development setup and workspace reference for tx. For using the CLI and extension in production, see [README.md](README.md).

## Prerequisites

- **[Bun](https://bun.sh)** 1.3+
- Everything in [README — Prerequisites](README.md#prerequisites) (Helium, Discord webhook, customer data)

## From source

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
bun run --filter @tx/extension build   # production extension build (used by release pipeline)
bun run --filter @tx/cli dev -- --help # run CLI in dev mode
bun run --filter @tx/cli build         # build release binaries
```

## Extension content scripts

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

## Conventions

See [AGENTS.md](AGENTS.md) for workspace rules, testing philosophy, and Effect patterns.
