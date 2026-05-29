# tx documentation

Reference material for tiket.com autobuy and related browser automation.

| Document                                                       | Purpose                                                                 |
| -------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [browser-memory.md](./browser-memory.md)                       | Spawn density: profile-dir vs user-data-dir, benchmarks, Chromium flags |
| [tiket-packages-flow.md](./tiket-packages-flow.md)             | General sale vs membership/presale: data model, user flow, API, state   |
| [tiket-packages-dom.md](./tiket-packages-dom.md)               | Expected DOM, test IDs, hash routes, and selectors for autobuy          |
| [tiket-reverse-engineering.md](./tiket-reverse-engineering.md) | How to explore minified Next.js bundles yourself                        |

**Scope:** tiket.com to-do **packages** page (Next.js Pages Router, client-rendered package list).

**Extension entrypoint:** `packages/extension/src/entrypoints/tiket-autobuy.content/flow-packages.ts`

**Note:** Tiket redeploys often. Hashed chunk filenames (`1234-deadbeef.js`), webpack module IDs, and CSS class suffixes change between builds. This docs set emphasizes **stable symbols** (API paths, i18n keys, `data-testid`, hash anchors, store field names) and **how to find** the rest on a fresh build — not a frozen file list.
