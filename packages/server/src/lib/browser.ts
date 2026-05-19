import { Context, Effect, FileSystem, HashMap, Layer } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import which from "which"
import { generateName } from "./names.ts"

export interface BrowserEntry {
  handle: ChildProcessSpawner.ChildProcessHandle
  profilePath: string
}

export class BrowserManager extends Context.Service<BrowserManager>()("BrowserManager", {
  make: Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const browsers = HashMap.make()

    const browserPath = yield* Effect.promise(() => which("firefox"))

    const spawnBrowser = Effect.fn(function* (url: string) {
      const name = generateName()
      const dir = yield* fs.makeTempDirectory({ prefix: name })
      yield* Effect.logInfo("Profile created at", dir)

      const command = ChildProcess.make`${browserPath} --new-instance --profile ${dir} ${url}`

      const handle = yield* spawner.spawn(command)

      return { handle, profilePath: dir } satisfies BrowserEntry
    })

    return {
      spawnBrowser,
      browsers,
    }
  }),
}) {
  static layer = Layer.effect(this, this.make)
}
