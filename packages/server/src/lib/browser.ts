import { Context, Effect, FileSystem, Layer, pipe, Schema } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import words from "../assets/words.json" with { type: "json" }
import { INIT_PAYLOAD_PARAM, InitPayloadFromUrlParam } from "../rpc/schema.ts"

interface BrowserEntry {
  handle: ChildProcessSpawner.ChildProcessHandle
  profilePath: string
}

const randomBrowserId = () => {
  const adjective = words.adjectives[Math.floor(Math.random() * words.adjectives.length)]
  const noun = words.nouns[Math.floor(Math.random() * words.nouns.length)]
  return `${adjective}-${noun}`
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
          `Built extension not found at ${extensionPath}. Run: pnpm --filter @tx/extension build`,
        ),
      )
    }

    const removeProfile = (profilePath: string) =>
      pipe(
        fs.remove(profilePath, { recursive: true, force: true }),
        Effect.catchTag("PlatformError", (err) => Effect.logError("Failed to remove profile", err)),
      )

    const allocateBrowserId = () => {
      let browserId = randomBrowserId()
      while (browsers.has(browserId)) {
        browserId = randomBrowserId()
      }
      return browserId
    }

    const spawn = Effect.fn(function* ({ url, port }: { url: string; port: number }) {
      const browserId = allocateBrowserId()
      const dir = yield* fs.makeTempDirectory({ prefix: browserId })
      yield* Effect.logInfo(`Profile created for ${browserId} at`, dir)

      const encoded = Schema.encodeSync(InitPayloadFromUrlParam)({ browserId, port })

      const urlWithInit = new URL(url)
      urlWithInit.searchParams.set(INIT_PAYLOAD_PARAM, encoded)

      const command = ChildProcess.make`${browserPath} --user-data-dir=${dir} --load-extension=${extensionPath} --no-first-run --no-default-browser-check --disable-default-apps ${urlWithInit.toString()}`
      const handle = yield* spawner.spawn(command)

      const entry = { handle, profilePath: dir } satisfies BrowserEntry
      browsers.set(browserId, entry)
      yield* Effect.logInfo(`Browser spawned ${browserId}`, entry)

      return browserId
    })

    const kill = Effect.fn(function* (browserId: string) {
      const entry = browsers.get(browserId)
      if (!entry) return

      yield* entry.handle.kill()
      yield* removeProfile(entry.profilePath)
      browsers.delete(browserId)
    })

    yield* Effect.addFinalizer(
      Effect.fn(function* () {
        for (const [browserId, entry] of browsers.entries()) {
          yield* Effect.logInfo(`Cleaning up browser profile ${browserId}`)
          yield* removeProfile(entry.profilePath)
        }
      }),
    )

    return { spawn, kill }
  }),
}) {
  static layer = (extensionPath: string, browserPath: string) =>
    Layer.effect(this, this.make(browserPath, extensionPath))
}
