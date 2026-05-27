This project, tx, is a browser automation split into server/extension architecture to bypass bot detection and utilize a normal browser extension.

Use pnpm as package manager.
Run `pnpm run check` after completing a task (typecheck per package, `vitest` at workspace root, lint and format at workspace root).

## Workspace

- `packages/server` — CLI / RPC server
- `packages/extension` — browser extension

Node.js can run `.ts` (see `package.json`) files directly (no need for ts-node or tsx).

Never explicitly write types unless needed. Prefer type inference.

# References Directory

The `.references/` directory contains shallow clones of important external repositories.
Never make any changes in this directory, it is ignored by git and meant as reference only.

Prefer exploring and reading this directory over searching for documentation. Think of it as the source of truth.

Available references:

- effect-smol - Effect v4
- wxt - WXT (extension framework; manifest, entrypoints, MV2/MV3 conversion)
