import { Effect, FileSystem, Path, Schema } from "effect"
import * as tar from "tar"
import { TxConfig } from "./config.ts"

const extensionDir = "extension"

export class ExtensionNotAvailable extends Schema.TaggedErrorClass<ExtensionNotAvailable>()(
  "ExtensionNotAvailable",
  {
    message: Schema.String,
  },
) {}

export const resolveBrowserExtensionPath = Effect.fn("resolveBrowserExtensionPath")(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const { paths } = yield* TxConfig

  const libPath = yield* path.fromFileUrl(new URL(import.meta.url))
  const workspaceDir = path.resolve(
    path.dirname(libPath),
    "../../../extension/.output/chrome-mv2-dev",
  )
  const workspaceManifest = path.join(workspaceDir, "manifest.json")

  if (yield* fs.exists(workspaceManifest)) {
    yield* Effect.logDebug("Using workspace extension at", workspaceDir)
    return workspaceDir
  }

  const installDir = path.join(paths.env.data, extensionDir)
  const manifestPath = path.join(installDir, "manifest.json")

  if (yield* fs.exists(manifestPath)) {
    yield* Effect.logDebug("Using installed extension at", installDir)
    return installDir
  }

  const { default: archivePath } = yield* Effect.promise(
    () => import("../assets/extension.tar.gz", { with: { type: "file" } }),
  )
  const archiveBytes = yield* fs.readFile(archivePath)

  yield* fs.remove(installDir, { recursive: true, force: true })
  yield* fs.makeDirectory(installDir, { recursive: true })

  const tmpArchive = path.join(paths.env.data, ".extension-archive.tgz")
  yield* fs.writeFile(tmpArchive, archiveBytes)
  yield* Effect.tryPromise({
    try: () => tar.x({ file: tmpArchive, cwd: installDir, gzip: true }),
    catch: (cause) => new ExtensionNotAvailable({ message: String(cause) }),
  })
  yield* fs.remove(tmpArchive, { force: true })

  return installDir
})
