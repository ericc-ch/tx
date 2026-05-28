import { Context, Effect, FileSystem, Layer, Schema } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import words from "../assets/words.json" with { type: "json" }
import { INIT_PAYLOAD_PARAM, InitPayloadFromUrlParam } from "../rpc/schema.ts"

interface BrowserEntry {
  handle: ChildProcessSpawner.ChildProcessHandle
  profilePath: string
}

interface BrowserManagerOptions {
  browserPath: string
  extensionPath: string
}

const pickWord = <T>(words: readonly T[]) => words[Math.floor(Math.random() * words.length)]

export class BrowserManager extends Context.Service<BrowserManager>()("BrowserManager", {
  make: Effect.fn(function* ({ browserPath, extensionPath }: BrowserManagerOptions) {
    const fs = yield* FileSystem.FileSystem
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const browsers = new Map<string, BrowserEntry>()
    let nextBrowserIndex = 1

    const extensionExists = yield* fs.exists(extensionPath)
    if (!extensionExists) {
      return yield* Effect.die(
        new Error(
          `Built extension not found at ${extensionPath}. Run: pnpm --filter @tx/extension build`,
        ),
      )
    }

    const spawn = Effect.fn(function* ({ url, port }: { url: string; port: number }) {
      const browserId = yield* Effect.sync(() => {
        const adjective = pickWord(words.adjectives)
        const noun = pickWord(words.nouns)
        return `${port}-${nextBrowserIndex++}-${adjective}-${noun}`
      })
      const dir = yield* fs.makeTempDirectory({ prefix: browserId })
      yield* Effect.logInfo(`Profile created for ${browserId} at`, dir)

      const encoded = Schema.encodeSync(InitPayloadFromUrlParam)({ browserId, port })

      const urlWithInit = new URL(url)
      urlWithInit.searchParams.set(INIT_PAYLOAD_PARAM, encoded)

      const command = ChildProcess.make`${browserPath} --user-data-dir=${dir} --load-extension=${extensionPath} --no-first-run --no-default-browser-check --disable-default-apps ${urlWithInit.toString()}`
      const handle = yield* spawner.spawn(command)

      const entry = { handle, profilePath: dir } satisfies BrowserEntry
      yield* Effect.sync(() => {
        browsers.set(browserId, entry)
      })
      yield* Effect.logInfo(`Browser spawned ${browserId}`, entry)

      return browserId
    })

    const kill = Effect.fn(function* (browserId: string) {
      const entry = yield* Effect.sync(() => {
        const e = browsers.get(browserId)
        if (e) browsers.delete(browserId)
        return e
      })
      if (!entry) return

      yield* Effect.ensuring(
        entry.handle
          .kill()
          .pipe(
            Effect.catchTag("PlatformError", (err) =>
              Effect.logWarning(`Browser ${browserId} kill failed (may already be dead)`, err),
            ),
          ),
        fs
          .remove(entry.profilePath, { recursive: true, force: true })
          .pipe(
            Effect.catchTag("PlatformError", (err) =>
              Effect.logError(`Failed to remove profile for ${browserId}`, err),
            ),
          ),
      )
    })

    yield* Effect.addFinalizer(
      Effect.fn(function* () {
        const browserIds = yield* Effect.sync(() => Array.from(browsers.keys()))
        for (const browserId of browserIds) {
          yield* Effect.logInfo(`Cleaning up browser ${browserId}`)
          yield* kill(browserId)
        }
      }),
    )

    return { spawn, kill }
  }),
}) {
  static layer = (options: BrowserManagerOptions) => Layer.effect(this, this.make(options))
}
