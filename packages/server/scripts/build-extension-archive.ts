import { mkdir, readdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const serverPackage = join(dirname(fileURLToPath(import.meta.url)), "..")
const extensionPackage = join(serverPackage, "../extension")
const extensionOut = join(extensionPackage, ".output/chrome-mv2")
const archivePath = join(serverPackage, "src/assets/extension.tar.gz")

await mkdir(dirname(archivePath), { recursive: true })

const files: Record<string, Uint8Array> = {}
const walk = async (root: string, prefix = "") => {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const full = join(root, entry.name)
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) await walk(full, relative)
    else files[relative] = await Bun.file(full).bytes()
  }
}

console.log("building extension (wxt)")
const wxt = Bun.spawn(["bun", "run", "build"], {
  cwd: extensionPackage,
  stdout: "inherit",
  stderr: "inherit",
})
if ((await wxt.exited) !== 0) {
  console.error("extension build failed")
  process.exit(1)
}

await walk(extensionOut)
if (!("manifest.json" in files)) {
  console.error(`manifest.json missing under ${extensionOut}`)
  process.exit(1)
}

const bytes = await new Bun.Archive(files, { compress: "gzip" }).bytes()
await Bun.write(archivePath, bytes)

console.log(`extension archive ${archivePath} (${bytes.byteLength} bytes)`)
