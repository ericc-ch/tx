import { mkdir, rm } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const serverPackage = join(dirname(fileURLToPath(import.meta.url)), "..")
const entrypoint = join(serverPackage, "src/cli.ts")
const outdir = join(serverPackage, "dist")
const buildExtensionArchive = join(serverPackage, "scripts/build-extension-archive.ts")

const targets = [
  { target: "bun-linux-x64", outfile: join(outdir, "tx-linux-x64") },
  { target: "bun-windows-x64", outfile: join(outdir, "tx-win-x64.exe") },
] satisfies Array<{ target: Bun.Build.CompileTarget; outfile: string }>

const archiveScript = Bun.spawn(["bun", buildExtensionArchive], {
  stdout: "inherit",
  stderr: "inherit",
})
if ((await archiveScript.exited) !== 0) {
  console.error("extension archive build failed")
  process.exit(1)
}

await rm(outdir, { recursive: true, force: true })
await mkdir(outdir)

console.log(`entrypoint ${entrypoint}`)
console.log(`output ${outdir}`)

const failed: Array<string> = []

for (const { target, outfile } of targets) {
  console.log(`[${target}] compiling ${outfile}`)

  const result = await Bun.build({
    entrypoints: [entrypoint],
    compile: {
      target,
      outfile,
      autoloadBunfig: false,
      autoloadDotenv: false,
    },
    minify: true,
    bytecode: true,
  })

  if (result.success) {
    console.log(`[${target}] ok`)
    continue
  }

  console.error(`[${target}] failed`)
  for (const log of result.logs) console.error(log)
  failed.push(target)
}

if (failed.length > 0) {
  console.error(`build failed (${failed.length}/${targets.length}): ${failed.join(", ")}`)
  process.exit(1)
}

console.log(`built ${targets.length} binaries in ${outdir}`)
