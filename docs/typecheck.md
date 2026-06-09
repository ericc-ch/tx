# Typecheck

```bash
bun run typecheck   # tsc -b + per-package scripts
```

## Root solution (`tsc -b`)

Root [tsconfig.json](../tsconfig.json) is a **solution** project. It references composite packages and typechecks them in one pass. No JS is emitted — only `.tsbuildinfo` for incremental builds.

| Project           | Checked via                           |
| ----------------- | ------------------------------------- |
| `@tx/schema`      | root `tsc -b`                         |
| `@tx/pool-server` | root `tsc -b`                         |
| `@tx/cli`         | root `tsc -b`                         |
| `scripts/`        | root `tsc -b` (`tsconfig.tools.json`) |
| `@tx/extension`   | own `typecheck` script (WXT tsconfig) |

Extension is separate: WXT generates its own tsconfig, so it runs `tsc --noEmit` via a workspace script instead of joining the root solution.

## Add a package to the solution

1. Create `packages/<name>/tsconfig.json` extending the root config.
2. Set `"composite": true` and match module settings to siblings (`NodeNext`, `allowImportingTsExtensions`, etc.).
3. Add `{ "path": "./packages/<name>/" }` to root `tsconfig.json` `references`.

That is enough. Do **not** add nested `references` inside the new package for its dependencies.

## Do not

- **Nested project references** — e.g. CLI → schema. Referenced composites cannot inherit `noEmit: true` from the root; you do not need them anyway (see [package-exports.md](package-exports.md)).
- **Declaration emit / `dist/` for typecheck** — packages export source `.ts` files; `tsc -b` follows those directly.
- **Per-package `typecheck` scripts** for solution members — root `tsc -b` already covers them. Reserve workspace scripts for packages with their own tsconfig (extension).
