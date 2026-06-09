import { NodeFileSystem, NodePath } from "@effect/platform-node"
import { Effect, FileSystem, Layer, Path } from "effect"

const platform = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)

export async function readmeContent() {
  return Effect.runPromise(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const libPath = yield* path.fromFileUrl(new URL(import.meta.url))
      const readmePath = path.resolve(path.dirname(libPath), "../../../../README.md")
      return yield* fs.readFileString(readmePath)
    }).pipe(Effect.provide(platform)),
  )
}
