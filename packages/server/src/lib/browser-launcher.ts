import { Context, Effect, FileSystem, Layer, Path, Schema } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import words from "../assets/words.json" with { type: "json" }
import { TxConfig } from "./config.ts"
import { INIT_PAYLOAD_PARAM, InitPayloadFromUrlParam } from "../rpc/schema.ts"

interface BrowserEntry {
  handle: ChildProcessSpawner.ChildProcessHandle
  profilePath: string
}

export const browserSwitches = [
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-default-apps",
  "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding",
  "--disable-backgrounding-occluded-windows",
  "--disable-hang-monitor",
  "--disable-prompt-on-repost",
  "--disable-popup-blocking",
  "--disable-component-update",
]

export class BrowserLauncher extends Context.Service<BrowserLauncher>()(
  "@tx/server/BrowserLauncher",
  {
    make: Effect.fn(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
      const { config, paths } = yield* TxConfig
      const { configFilePath, userDataDir, templateDir } = paths
      const browsers = new Map<string, BrowserEntry>()
      let nextBrowserIndex = 1

      if (config.browserExtensionPath.length === 0) {
        return yield* Effect.die(
          new Error(
            `browserExtensionPath is not set in ${configFilePath}. Run: pnpm --filter @tx/extension build, then set the path in config.`,
          ),
        )
      }

      const extensionExists = yield* fs.exists(config.browserExtensionPath)
      if (!extensionExists) {
        return yield* Effect.die(
          new Error(
            `Built extension not found at ${config.browserExtensionPath}. Run: pnpm --filter @tx/extension build, then update ${configFilePath}.`,
          ),
        )
      }

      const spawn = Effect.fn(function* ({ url, port }: { url: string; port: number }) {
        const browserId = yield* Effect.sync(() => {
          const adjective = words.adjectives[Math.floor(Math.random() * words.adjectives.length)]
          const noun = words.nouns[Math.floor(Math.random() * words.nouns.length)]
          return `${port}-${nextBrowserIndex++}-${adjective}-${noun}`
        })

        const templateExists = yield* fs.exists(templateDir)
        if (!templateExists) {
          return yield* Effect.die(
            new Error(
              `Template profile not found at ${templateDir}. Create one with: tx tiket template create`,
            ),
          )
        }

        const profilePath = path.join(userDataDir, browserId)
        yield* fs.copy(templateDir, profilePath)
        yield* Effect.logInfo(`Profile created for ${browserId} at`, profilePath)

        const encoded = Schema.encodeSync(InitPayloadFromUrlParam)({ browserId, port })

        const urlWithInit = new URL(url)
        urlWithInit.searchParams.set(INIT_PAYLOAD_PARAM, encoded)

        const command = ChildProcess.make(config.browserExecutable, [
          `--user-data-dir=${userDataDir}`,
          `--profile-directory=${browserId}`,
          `--load-extension=${config.browserExtensionPath}`,
          ...browserSwitches,
          urlWithInit.toString(),
        ])
        const handle = yield* Effect.acquireRelease(
          spawner.spawn(command),
          Effect.fn(function* () {
            yield* Effect.sync(() => {
              browsers.delete(browserId)
            })
            yield* fs.remove(profilePath, { recursive: true, force: true })
            yield* Effect.logInfo(`Profile removed for ${browserId}`)
          }, Effect.orDie),
        )

        const entry = { handle, profilePath }
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

        yield* entry.handle.kill().pipe(Effect.ignore)
        yield* fs.remove(entry.profilePath, { recursive: true, force: true })
      })

      return { spawn, kill }
    }),
  },
) {
  static layer = Layer.effect(this, this.make())
}
