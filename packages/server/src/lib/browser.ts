import { Context, Effect, FileSystem, Layer, pipe } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import which from "which"
import { generateName } from "./names.ts"

export interface BrowserEntry {
  handle: ChildProcessSpawner.ChildProcessHandle
  profilePath: string
}

export class BrowserManager extends Context.Service<BrowserManager>()("BrowserManager", {
  make: Effect.fn(function* (browserPath: string, extensionPath: string) {
    const fs = yield* FileSystem.FileSystem
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const browsers = new Map<string, BrowserEntry>()

    const extensionExists = yield* fs.exists(extensionPath)
    if (!extensionExists) {
      return yield* Effect.die(
        new Error(
          `Built extension not found at ${extensionPath}. Run: pnpm --filter @tiket-tools/extension build`,
        ),
      )
    }

    const spawn = Effect.fn(function* (url: string) {
      const name = generateName()
      const dir = yield* fs.makeTempDirectory({ prefix: name })
      yield* Effect.logInfo("Profile created at", dir)

      const urlWithId = new URL(url)
      urlWithId.searchParams.set("__browser_id", name)

      const command = ChildProcess.make`${browserPath} --user-data-dir=${dir} --load-extension=${extensionPath} --no-first-run --no-default-browser-check --disable-default-apps ${urlWithId.toString()}`
      const handle = yield* spawner.spawn(command)

      const entry = { handle, profilePath: dir } satisfies BrowserEntry
      yield* Effect.logInfo("Browser spawned", entry)
      browsers.set(name, entry)

      return entry
    })

    const kill = Effect.fn(function* (name: string) {
      const entry = browsers.get(name)
      if (entry) {
        yield* entry.handle.kill()
        yield* fs
          .remove(entry.profilePath, { recursive: true, force: true })
          .pipe(
            Effect.catchTag("PlatformError", (err) =>
              Effect.logError("Failed to remove profile", err),
            ),
          )
        browsers.delete(name)
      }
    })

    yield* Effect.addFinalizer(
      Effect.fn(function* () {
        for (const [name, entry] of browsers.entries()) {
          yield* Effect.logInfo("Cleaning up browser profile", name)
          yield* fs
            .remove(entry.profilePath, { recursive: true, force: true })
            .pipe(
              Effect.catchTag("PlatformError", (err) =>
                Effect.logError("Failed to remove profile", err),
              ),
            )
        }
      }),
    )

    return {
      spawn,
      kill,
      browsers,
    }
  }),
}) {
  static layer = (extensionPath: string, browserPath?: string) =>
    Layer.effect(
      this,
      browserPath !== undefined
        ? this.make(browserPath, extensionPath)
        : pipe(
            Effect.promise(() => which("helium")),
            Effect.andThen((path) => this.make(path, extensionPath)),
          ),
    )
}
