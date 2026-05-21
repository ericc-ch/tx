import { NodeFileSystem, NodePath } from "@effect/platform-node"
import { Effect, FileSystem, Layer, Path } from "effect"

export const loadHtml = (html: string) => {
  document.body.innerHTML = new DOMParser().parseFromString(html, "text/html").body.innerHTML
}

export const resetDom = () => {
  document.body.innerHTML = ""
}

export const NodePlatform = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)

export const loadFixture = (relativePath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const utilFile = yield* path.fromFileUrl(new URL(import.meta.url))
    const fixture = path.join(path.dirname(utilFile), relativePath)
    loadHtml(yield* fs.readFileString(fixture))
  })
