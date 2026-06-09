import { Effect, FileSystem, Path, Schema } from "effect"

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

  const sidecarDir = path.join(path.dirname(process.execPath), extensionDir)
  const sidecarManifest = path.join(sidecarDir, "manifest.json")

  if (yield* fs.exists(sidecarManifest)) {
    yield* Effect.logDebug("Using sidecar extension at", sidecarDir)
    return sidecarDir
  }

  return yield* new ExtensionNotAvailable({
    message:
      "Extension not found. Place an extension/ folder next to the tx binary (with manifest.json inside). Build release assets with: bun run --filter @tx/cli build",
  })
})
