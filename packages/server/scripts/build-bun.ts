import { mkdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const serverPackage = join(dirname(fileURLToPath(import.meta.url)), "..")
const entrypoint = join(serverPackage, "src/cli.ts")
const outdir = join(serverPackage, "build")

const targets = [
  { target: "bun-linux-x64", outfile: join(outdir, "tx-linux-x64") },
  { target: "bun-windows-x64", outfile: join(outdir, "tx-win-x64.exe") },
] as const

await mkdir(outdir, { recursive: true })

let failed = false

for (const { target, outfile } of targets) {
  process.stderr.write(`bun build --compile --target=${target} -> ${outfile}\n`)

  const result = await Bun.build({
    entrypoints: [entrypoint],
    compile: {
      target,
      outfile,
    },
    minify: true,
    sourcemap: "linked",
  })

  if (!result.success) {
    failed = true
    for (const log of result.logs) console.error(log)
  }
}

if (failed) process.exit(1)
