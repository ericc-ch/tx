# Bun → Deno migration plan

Handoff document for migrating **tx** from Bun to Deno with **Node compatibility**, minimizing application code changes. Written from research and hands-on validation (Deno 2.9.1, July 2026).

## Goals

1. Replace Bun as package manager, dev runtime, and release compiler.
2. Keep **Node compat** — no rewrite to `Deno.*` APIs in application code unless unavoidable.
3. Keep existing **`package.json` workspace** layout; **`deno.json` is optional**.
4. Preserve third-party toolchains (vitest, tsc, wxt, oxfmt, oxlint) per [AGENTS.md](../AGENTS.md).

## Non-goals (for initial migration)

- Switching from vitest to `deno test`
- Switching from oxfmt/oxlint to `deno fmt` / `deno lint`
- Rewriting `@effect/platform-node` usage
- Embedding the browser extension inside the compiled CLI binary (keep sidecar `extension/` folder)

---

## Executive summary

| Area | Verdict |
|------|---------|
| Application TypeScript (`node:` imports, Effect) | ✅ Runs on Deno today with no changes |
| `package.json` workspaces + `catalog:` | ✅ Deno reads natively; no `deno.json` required |
| `deno install` | ✅ Seeds `deno.lock` from existing `bun.lock` |
| Vitest 4.1.9 | ✅ 26/26 tests pass under Deno (after `wxt prepare`) |
| WXT build | ✅ `deno run -A npm:wxt build` works |
| WXT dev/watch | ⚠️ Unofficial; [wxt#1307](https://github.com/wxt-dev/wxt/issues/1307) |
| CLI dev (`deno run -A`) | ✅ Works after macro removal |
| `deno compile` release binaries | ✅ Works; **~4× larger than Bun** (~450 MB vs ~110 MB) |
| Bun macro (`with { type: "macro" }`) | ❌ Replace with runtime read + `deno compile --include` |

**Recommendation:** Incremental migration. Change tooling/scripts first; decide on release binary size before dropping Bun compile entirely.

---

## Do we need `deno.json`?

**No.** Deno treats `package.json` as first-class:

- Dependencies, workspaces, catalogs, and `scripts` are read directly.
- `deno task <script>` runs `package.json` scripts (equivalent to `bun run`).
- npm-style `"workspaces": ["packages/*"]` is supported without conversion.

From [Deno configuration](https://docs.deno.com/runtime/fundamentals/configuration/):

> Most Node.js projects run with no changes and you do not need a `deno.json` at all.

Optional minimal root `deno.json` (only if desired):

```json
{
  "nodeModulesDir": "auto"
}
```

Deno 2 defaults to `"manual"` when a `package.json` exists (run `deno install` explicitly). `"auto"` recreates `node_modules` on each run — closer to Bun's always-ready behavior.

Do **not** add per-package `deno.json` files unless you need Deno-specific config there.

---

## Current Bun surface area

### Production / runtime code

Almost everything is already Node-compatible. Grep for Bun-specific usage:

| Location | Bun-specific? | Action |
|----------|---------------|--------|
| `packages/cli/src/**`, `packages/pool-server/src/**`, `packages/schema/**`, `packages/extension/src/**` | No `Bun.*` APIs | Keep as-is |
| `packages/cli/src/main.ts`, `packages/pool-server/src/main.ts`, `scripts/references.ts` | `#!/usr/bin/env bun` shebang | Change to Deno shebang |
| `packages/cli/src/cli/readme.ts` | `with { type: "macro" }` | Replace (see below) |
| `packages/cli/scripts/build.ts` | `Bun.build({ compile })` | Rewrite using `deno compile` |

### Tooling only

| Location | Current | Deno equivalent |
|----------|---------|-----------------|
| Root `package.json` scripts | `bun run …` | `deno task …` / `deno run -A …` |
| `packages/cli/package.json` | `bun --env-file=…` | `deno run -A --env-file=…` |
| `packages/pool-server/package.json` | `bun src/main.ts` | `deno run -A src/main.ts` |
| Pre-commit hook | `bun run check` | `deno task check` |
| `packageManager` field | `bun@1.3.14` | Remove or replace with Deno version note in docs |
| `@types/bun` | cli, pool-server | Remove |
| `bun.lock` | lockfile | Replace with `deno.lock` after `deno install` |

### Intentionally unchanged (third-party CLIs)

Per AGENTS.md, keep these on their own runners:

- `vitest` — `deno run -A npm:vitest run`
- `tsc` — `deno run -A npm:tsc -b`
- `wxt` — `deno run -A npm:wxt`
- `oxfmt` / `oxlint` — `deno run -A npm:oxfmt` etc.

---

## Verified on a repo clone (Deno 2.9.1)

Commands run against a fresh clone with **no `deno.json`**:

```sh
deno install
# → resolves all workspace deps, seeds deno.lock from bun.lock

deno run -A npm:wxt prepare   # in packages/extension
deno run -A npm:vitest run --passWithNoTests
# → 4 test files, 26 tests passed

deno run -A npm:wxt build     # in packages/extension
# → .output/chrome-mv2 produced

DISCORD_WEBHOOK_URL=https://example.com/x deno run -A packages/cli/src/main.ts --help
# → fails on macro import; works after macro replacement

deno compile -A --env-file=packages/cli/.env.production --include README.md \
  -o /tmp/tx-linux-x64 packages/cli/src/main.ts
# → binary runs; tx readme prints README; env var embedded

deno compile --target x86_64-pc-windows-msvc …
# → Windows cross-compile succeeds from Linux
```

### Binary size comparison (same repo)

| Tool | Linux binary | Notes |
|------|--------------|-------|
| Bun `Bun.build({ compile })` | ~107 MB | Current release path |
| Deno `deno compile` | ~450 MB | Embeds full `node_modules` (~345 MB) even with `--bundle --minify` |

**Decision required** before switching release builds. Options:

1. Accept larger binaries.
2. Keep Bun **only** for `packages/cli/scripts/build.ts` (hybrid).
3. Investigate Deno compile size optimizations upstream / isolated compile graph.

---

## Permissions

Bun runs unsandboxed. Deno sandboxes by default. The CLI needs broad access (spawn browsers, HTTP server, read files, env):

```sh
deno run -A …          # dev — matches unrestricted Bun
deno compile -A …      # bake permissions into release binary
```

Granular alternative for compiled binaries: `--allow-run --allow-net --allow-read --allow-env --allow-sys`.

---

## Macro → `deno compile --include` (README)

Bun inlines README at bundle time via macro:

```ts
// packages/cli/src/cli/readme.ts (current)
import { readmeContent } from "../macros/readme.ts" with { type: "macro" }
const readmeText = readmeContent()
```

Deno has no bundle-time macros ([migrate from Bun](https://docs.deno.com/runtime/migrate/migrate_from_bun.md)). Use **runtime read** + **compile-time embed**:

### 1. Replace `readme.ts`

Reuse logic from `packages/cli/src/macros/readme.ts` inline (Effect FileSystem) or use a direct read:

```ts
import { Console, Effect, FileSystem, Path } from "effect"
import { Command } from "effect/unstable/cli"

const readReadme = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const libPath = yield* path.fromFileUrl(new URL(import.meta.url))
  const readmePath = path.resolve(path.dirname(libPath), "../../../../README.md")
  return yield* fs.readFileString(readmePath)
})

export const readmeCommand = Command.make(
  "readme",
  {},
  Effect.fn(function* () {
    yield* Console.log(yield* readReadme)
  }),
).pipe(
  Command.withDescription("Print the tx user guide (README)."),
  Command.withExamples([
    { command: "tx readme", description: "Show installation, configuration, and command reference" },
    { command: "tx readme | less -R", description: "Scroll through the guide in a pager" },
  ]),
)
```

### 2. Delete `packages/cli/src/macros/readme.ts`

### 3. Pass asset at compile time

```sh
deno compile -A \
  --env-file=.env.production \
  --include README.md \
  --bundle --minify \
  --target x86_64-unknown-linux-gnu \
  -o dist/tx-linux-x64 \
  src/main.ts
```

`--include README.md` embeds the file in the binary VFS ([deno compile docs](https://docs.deno.com/runtime/reference/cli/compile/)). `--env-file` embeds env vars (verified: `DISCORD_WEBHOOK_URL` available at runtime without a sidecar `.env`).

For the extension sidecar, **do not** embed in the binary — keep shipping `extension/` beside the binary per [CONTRIBUTING.md](../CONTRIBUTING.md). Optional: `--include-as-is` for pre-built bundles if embedding is desired later.

---

## Rewrite `packages/cli/scripts/build.ts`

Replace `Bun.build()` with `Deno.Command` spawning `deno compile`:

```ts
import { mkdir, rm } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const cliPackage = join(dirname(fileURLToPath(import.meta.url)), "..")

const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL?.trim()
if (!discordWebhookUrl) {
  console.error(
    "DISCORD_WEBHOOK_URL is required — copy .env.example to .env.production or run with deno run -A --env-file=.env.production",
  )
  Deno.exit(1)
}

const entrypoint = join(cliPackage, "src/main.ts")
const readme = join(cliPackage, "../../README.md")
const outdir = join(cliPackage, "dist")
const envFile = join(cliPackage, ".env.production")

const targets = [
  { target: "x86_64-unknown-linux-gnu", outfile: join(outdir, "tx-linux-x64") },
  { target: "x86_64-pc-windows-msvc", outfile: join(outdir, "tx-win-x64.exe") },
] as const

await rm(outdir, { recursive: true, force: true })
await mkdir(outdir)

const failed: string[] = []

for (const { target, outfile } of targets) {
  console.log(`[${target}] compiling ${outfile}`)

  const cmd = new Deno.Command(Deno.execPath(), {
    args: [
      "compile",
      "-A",
      "--bundle",
      "--minify",
      `--env-file=${envFile}`,
      `--include=${readme}`,
      `--target=${target}`,
      "-o", outfile,
      entrypoint,
    ],
    stdout: "inherit",
    stderr: "inherit",
  })

  const { code } = await cmd.output()
  if (code === 0) {
    console.log(`[${target}] ok`)
  } else {
    console.error(`[${target}] failed`)
    failed.push(target)
  }
}

if (failed.length > 0) {
  console.error(`build failed (${failed.length}/${targets.length}): ${failed.join(", ")}`)
  Deno.exit(1)
}

console.log(`built ${targets.length} binaries in ${outdir}`)
```

Note: script itself runs under `deno run -A` (uses `Deno.Command`, `Deno.exit`). Adjust if binary size of `--bundle` is unacceptable.

---

## File-by-file change checklist

### Must change

- [ ] `package.json` (root) — scripts, pre-commit hook, remove `packageManager`, remove `@types/bun` from catalog
- [ ] `packages/cli/package.json` — `dev`/`build` scripts, remove `@types/bun`
- [ ] `packages/pool-server/package.json` — `dev` script, remove `@types/bun`
- [ ] `packages/cli/scripts/build.ts` — `deno compile` via `Deno.Command`
- [ ] `packages/cli/src/cli/readme.ts` — remove macro, runtime README read
- [ ] `packages/cli/src/macros/readme.ts` — delete
- [ ] `packages/cli/src/main.ts` — shebang `#!/usr/bin/env -S deno run -A`
- [ ] `packages/pool-server/src/main.ts` — shebang
- [ ] `scripts/references.ts` — shebang
- [ ] `packages/cli/tsconfig.json` — remove `"bun"` from `types`
- [ ] `packages/pool-server/tsconfig.json` — remove `"bun"` from `types` if present
- [ ] `packages/cli/src/lib/config.ts` — update error messages mentioning `bun run dev`
- [ ] `AGENTS.md` — Bun → Deno conventions
- [ ] `CONTRIBUTING.md` — prerequisites, install, dev commands
- [ ] `README.md` — if it mentions Bun install

### Generate / replace lockfile

- [ ] Run `deno install` → creates `deno.lock`
- [ ] Remove `bun.lock` after migration is stable
- [ ] Add `deno.lock` to git; consider gitignoring `node_modules` (unchanged)

### Optional

- [ ] Root `deno.json` with `{ "nodeModulesDir": "auto" }` only
- [ ] `.github/workflows/*` — swap `oven-sh/setup-bun` for `denoland/setup-deno`
- [ ] `docs/typecheck.md` — update command examples

### Do not change (unless blocked)

- Application logic in `packages/cli/src`, `packages/pool-server/src`, `packages/schema`, `packages/extension/src`
- `tsconfig.json` module settings (`NodeNext` / `nodenext` in packages — works with Deno)
- WXT config, vitest config, fixtures, extension architecture

---

## `package.json` script mapping

### Root `package.json`

```json
{
  "scripts": {
    "build": "deno task --recursive build",
    "format": "deno run -A npm:oxfmt",
    "lint": "deno run -A npm:oxlint --fix",
    "check": "deno task typecheck && deno task test && deno task lint",
    "prepare": "simple-git-hooks && effect-language-service patch && deno run -A scripts/references.ts",
    "test": "deno run -A npm:vitest run --passWithNoTests",
    "typecheck": "deno run -A npm:tsc -b && deno task --recursive typecheck"
  },
  "simple-git-hooks": {
    "pre-commit": "deno task check"
  }
}
```

Remove from catalog: `"@types/bun"`. Remove `"packageManager": "bun@1.3.14"`.

### `packages/cli/package.json`

```json
{
  "scripts": {
    "build": "deno run -A --env-file=.env.production scripts/build.ts",
    "dev": "deno run -A --env-file=.env.dev src/main.ts"
  }
}
```

### `packages/pool-server/package.json`

```json
{
  "scripts": {
    "dev": "deno run -A src/main.ts"
  }
}
```

### `packages/extension/package.json`

No script changes required if root `deno task` invokes them; optionally prefix:

```json
{
  "scripts": {
    "dev": "deno run -A npm:wxt",
    "build": "deno run -A npm:wxt build",
    "prepare": "deno run -A npm:wxt prepare"
  }
}
```

### Workspace filtering

```sh
# Bun
bun run --filter @tx/cli dev -- tiket start …

# Deno (matches package.json "name")
deno task --filter @tx/cli dev -- tiket start …
```

Verified: `--filter` works with `package.json` `name` fields only (no per-package `deno.json`).

---

## Execution phases (for implementing agent)

### Phase 0 — Baseline (no breakage)

1. Install Deno 2.8+ locally / in CI.
2. On a branch: run `deno install` alongside existing `bun.lock` (generates `deno.lock`).
3. Run verification suite (see below) without changing source.
4. Document binary size comparison for release decision.

### Phase 1 — Code changes

1. Replace macro + delete `macros/readme.ts`.
2. Rewrite `packages/cli/scripts/build.ts`.
3. Update shebangs (3 files).
4. Update all `package.json` scripts (root + packages).
5. Remove `@types/bun`, update tsconfigs.
6. Update user-facing strings in `config.ts`.

### Phase 2 — Docs & hooks

1. Update `AGENTS.md`, `CONTRIBUTING.md`, `README.md`.
2. Update pre-commit hook to `deno task check`.
3. Run `deno approve-scripts` for `simple-git-hooks` if install warns about ignored build scripts.

### Phase 3 — Lockfile & CI

1. Commit `deno.lock`.
2. Remove `bun.lock` and `packageManager` field.
3. Update CI to `denoland/setup-deno@v2` and `deno task check`.
4. Full release smoke test: extension build → CLI compile → copy extension sidecar → run `tiket` flow.

### Phase 4 — Validate extension dev

1. `deno task --filter @tx/extension dev` — confirm watch/HMR works.
2. If broken, document workaround (Node/Bun for extension dev only) or fix WXT integration.

---

## Verification commands (run after each phase)

```sh
# Install
deno install

# Extension types (required before tests)
deno task --filter @tx/extension prepare

# Full check (replaces bun run check)
deno task check

# CLI smoke
cp packages/cli/.env.example packages/cli/.env.dev
# edit DISCORD_WEBHOOK_URL
deno task --filter @tx/cli dev -- --help

# Pool server smoke
deno task --filter @tx/pool-server dev -- --help   # if applicable

# Release build
deno task --filter @tx/extension build
deno task --filter @tx/cli build
cp -r packages/extension/.output/chrome-mv2 packages/cli/dist/extension
./packages/cli/dist/tx-linux-x64 --version

# Compiled binary env + readme
./packages/cli/dist/tx-linux-x64 readme | head -5
```

Expected: all tests pass, CLI help works, compiled binary runs standalone with embedded webhook URL and README.

---

## Risks and mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Release binary 4× larger | **High** | Benchmark before switching; hybrid Bun compile; track Deno compile improvements |
| WXT dev mode under Deno | Medium | Test early; extension build already works; fallback to Node for `wxt` dev only |
| `simple-git-hooks` postinstall | Low | `deno approve-scripts` |
| Vitest + Deno version drift | Low | Pin Deno ≥ 2.7.14; vitest tracking issue closed in 2.7.4 |
| `effect-language-service patch` in prepare | Low | Verify still runs via `deno task prepare` |
| Permission prompts in dev | Low | Use `-A` in all dev task definitions |
| Extension tests need `wxt prepare` | Low | Add to root `check` or document in CONTRIBUTING |

---

## AGENTS.md updates (after migration)

Replace Bun-specific rules with:

```markdown
Use Deno as package manager (`deno install`, workspaces in root `package.json`).
Run first-party `.ts` with Deno (`deno run -A path/to/file.ts`, `#!/usr/bin/env -S deno run -A`).
Use `node:` imports only, no Deno-specific runtime APIs (`Deno.*`) except in `packages/cli/scripts/build.ts` for compiled binaries.
Third-party CLIs (vitest, `tsc`, wxt) keep their own shebangs; invoke via `deno run -A npm:<pkg>`.

Run `deno task check` after completing a task.
```

---

## Bun → Deno quick reference

From [migrate from Bun](https://docs.deno.com/runtime/migrate/migrate_from_bun.md):

| Bun | Deno |
|-----|------|
| `bun install` | `deno install` |
| `bun run <script>` | `deno task <script>` |
| `bun file.ts` | `deno run -A file.ts` |
| `bun --env-file=.env x` | `deno run -A --env-file=.env x` |
| `bun run --filter @scope/pkg` | `deno task --filter @scope/pkg` |
| `bunx vitest` | `deno run -A npm:vitest` or `dx vitest` |
| `Bun.build({ compile })` | `deno compile` |
| `with { type: "macro" }` | `deno compile --include` + runtime read |
| `bunfig.toml` | optional `deno.json` (not required) |

---

## References

- [Migrate from Bun](https://docs.deno.com/runtime/migrate/migrate_from_bun.md)
- [Deno configuration (package.json vs deno.json)](https://docs.deno.com/runtime/fundamentals/configuration/)
- [Workspaces and monorepos](https://docs.deno.com/runtime/fundamentals/workspaces/)
- [Node and npm compatibility](https://docs.deno.com/runtime/fundamentals/node/)
- [deno compile](https://docs.deno.com/runtime/reference/cli/compile/)
- [deno task workspace support](https://docs.deno.com/runtime/reference/cli/task/)
- [WXT Deno support #1307](https://github.com/wxt-dev/wxt/issues/1307)
- [Vitest on Deno #23882](https://github.com/denoland/deno/issues/23882) (resolved Deno 2.7.4+)
- Effect-smol runs `deno check` and vitest-on-Deno in its own CI (see `.references/effect-smol/deno.json`)

---

## Open decisions for maintainer

1. **Accept ~450 MB release binaries** or keep hybrid Bun compile for releases?
2. **Optional root `deno.json`** with `nodeModulesDir: "auto"` — convenience vs zero-config?
3. **Extension dev** — require Deno for `wxt` watch, or allow Node/Bun fallback in docs only?

Once decided, implementing agent can execute Phases 0–4 and run `deno task check` before opening PR.
