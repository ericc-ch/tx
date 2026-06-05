import { Context, Effect, FileSystem, Layer, Path, References, Schema } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import words from "../assets/words.json" with { type: "json" }
import { PROFILE_TEMPLATE_DIRECTORY, TxConfig } from "./config.ts"
import { resolveBrowserExtensionPath } from "./extension.ts"
import { INIT_PAYLOAD_PARAM, InitPayloadFromUrlParam } from "../rpc/schema.ts"

interface BrowserEntry {
  handle: ChildProcessSpawner.ChildProcessHandle
  profilePath: string
}

const mobileWindowSize = "390,844"

export const browserSwitches = [
  `--window-size=${mobileWindowSize}`,
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
      const browserExtensionPath = yield* resolveBrowserExtensionPath().pipe(Effect.orDie)
      let { userDataDir, templateDir } = paths
      const browsers = new Map<string, BrowserEntry>()
      let nextBrowserIndex = 1

      if (config.copyUserDataDirToTmp) {
        const sourceUserDataDir = paths.userDataDir
        const tmpUserDataDir = yield* fs.makeTempDirectory({ prefix: "tx-user-data-" })
        yield* Effect.addFinalizer(() =>
          fs.remove(tmpUserDataDir, { recursive: true, force: true }).pipe(Effect.ignore),
        )
        yield* fs.copy(sourceUserDataDir, tmpUserDataDir)
        yield* Effect.logDebug(
          "Copied user data dir to tmp for runtime:",
          sourceUserDataDir,
          tmpUserDataDir,
        )
        userDataDir = tmpUserDataDir
        templateDir = path.join(tmpUserDataDir, PROFILE_TEMPLATE_DIRECTORY)
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
        yield* Effect.logDebug(`Profile created for ${browserId} at`, profilePath)

        const minimumLogLevel = yield* References.MinimumLogLevel
        const notifyPayment = !!config.discordWebhookUrl?.trim()
        const encoded = Schema.encodeSync(InitPayloadFromUrlParam)({
          browserId,
          port,
          minimumLogLevel,
          notifyPayment,
        })

        const urlWithInit = new URL(url)
        urlWithInit.searchParams.set(INIT_PAYLOAD_PARAM, encoded)

        const command = ChildProcess.make(config.browserExecutable, [
          `--user-data-dir=${userDataDir}`,
          `--profile-directory=${browserId}`,
          `--load-extension=${browserExtensionPath}`,
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
            yield* Effect.logDebug(`Profile removed for ${browserId}`)
          }, Effect.orDie),
        )

        const entry = { handle, profilePath }
        yield* Effect.sync(() => {
          browsers.set(browserId, entry)
        })
        yield* Effect.logDebug(`Browser spawned ${browserId}`, entry)

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
