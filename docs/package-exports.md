# Package exports

Workspace packages import each other through **package.json `exports`**, not TypeScript project references.

## Pattern

```json
{
  "exports": {
    ".": {
      "default": "./src/main.ts"
    }
  }
}
```

`@tx/cli` imports `@tx/schema` and `@tx/pool-server` this way. TypeScript resolves the export, typechecks the source file, and Bun runs it at runtime — no build step between packages.

## Export surface

Re-export the public API from `src/main.ts`:

```ts
export { CustomerPool } from "./lib/customer-pool.ts"
export { PoolConfig } from "./lib/config.ts"
```

Consumers import from the package name:

```ts
import { CustomerPool, PoolConfig } from "@tx/pool-server"
import { Customer, OperatorRpcs } from "@tx/schema"
```

Add new exports to the barrel (`main.ts`) when another package needs them. Subpath exports are fine if the surface grows, but the default entrypoint is enough today.

## Dependencies vs references

| Mechanism                                 | Purpose                                                   |
| ----------------------------------------- | --------------------------------------------------------- |
| `package.json` `dependencies` + `exports` | Runtime linking and type resolution between packages      |
| Root `tsconfig.json` `references`         | Which projects `tsc -b` typechecks — **not** import graph |

`@tx/pool-server` depends on `@tx/schema` via `workspace:*` and the export above. Its tsconfig does not need a `references` entry pointing at schema.
