This project, tx, is a browser automation split into server/extension architecture to bypass bot detection and utilize a normal browser extension.

Our priorities are (not ordered, all are important):

- Maintainability
- Reliability
- Performance
- Stealth

If a tradeoff is required, choose correctness and robustness over short-term convenience.

Duplicate logic across multiple files is a code smell and should be avoided. Don't be afraid to change existing code. Don't take shortcuts by just adding local logic to solve a problem.

Think at scale, a single server can hosts many (100+) browser instance at once.

Minimize nesting.

Use pnpm as package manager.
Node.js can run `.ts` (see `package.json`) files directly (no need for ts-node or tsx).

Never explicitly write types unless needed. Prefer type inference.

Run `pnpm run check` after completing a task (typecheck per package, `vitest` at workspace root, lint and format at workspace root).

Prefer inline code. Extract a function or helper only when it is reused or when duplication would be worse than the indirection. Do not split logic into small named pieces “for structure”. One straightforward flow is easier to read than a file of one-liner wrappers.

## Testing

Write fewer tests. Prefer integration tests.

Do not compromise production code for testing. No test-only hooks, exports, flags, or abstractions; no test-env branching or exposing internals for mocks. If something is hard to test, adapt the tests — not the product.

- Do not test what the type system already guarantees (eg schema shapes, literal unions, trivial getters).
- Test behavior that can actually regress.
- Use real fixtures only — HTML captured from production pages under `fixtures/`. Do not maintain synthetic stand-in pages; testing against fake DOM only validates your own mocks.
- Assert outcomes after a flow (filled fields, selected payment, completed step), not internal implementation details.

Reserve unit tests for server-side logic with non-obvious transforms or edge cases (e.g. CSV normalization, customer pool claiming).

## Workspace

- `packages/server` — CLI / RPC server
- `packages/extension` — browser extension

# References Directory

The `.references/` directory contains shallow clones of important external repositories.
Never make any changes in this directory, it is ignored by git and meant as reference only.

Prefer exploring and reading this directory over searching for documentation. Think of it as the source of truth.

Available references:

- effect-smol - Effect v4
- wxt - WXT (extension framework; manifest, entrypoints, MV2/MV3 conversion)
- playwright - Playwright
- discord.js - discord.js

## Idiomatic Effect (v4)

Use `.references/effect-smol` as the source of truth (also `ai-docs/` inside it for patterns).
