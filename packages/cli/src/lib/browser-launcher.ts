import { INIT_PAYLOAD_PARAM, InitPayloadFromUrlParam } from "@tx/schema"
import { Context, Effect, FileSystem, Layer, Path, References, Schema } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import words from "../assets/words.json" with { type: "json" }
import { templateProfileDirectory, TxConfig } from "./config.ts"
import { resolveBrowserExtensionPath } from "./extension.ts"

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

export class BrowserLauncher extends Context.Service<BrowserLauncher>()("@tx/cli/BrowserLauncher", {
  make: Effect.fn(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const { config, paths } = yield* TxConfig
    const browserExtensionPath = yield* resolveBrowserExtensionPath().pipe(Effect.orDie)
    let { userDataDir } = paths
    const browsers = new Map<string, BrowserEntry>()
    const templatePaths = new Map<string, string | null>()
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
    }

    const spawn = Effect.fn(function* ({
      url,
      port,
      template,
    }: {
      url: string
      port: number
      template?: string
    }) {
      const browserId = yield* Effect.sync(() => {
        const adjective = words.adjectives[Math.floor(Math.random() * words.adjectives.length)]
        const noun = words.nouns[Math.floor(Math.random() * words.nouns.length)]
        return `${port}-${nextBrowserIndex++}-${adjective}-${noun}`
      })

      const profilePath = path.join(userDataDir, browserId)
      if (template !== undefined) {
        let templatePath = templatePaths.get(template)
        if (templatePath === undefined) {
          const candidate = path.join(userDataDir, templateProfileDirectory(template))
          if (yield* fs.exists(candidate)) {
            templatePath = candidate
          } else {
            templatePath = null
            yield* Effect.logInfo(
              `Template "${template}" not found at ${candidate}; starting with fresh profile`,
            )
          }
          templatePaths.set(template, templatePath)
        }

        if (templatePath !== null) {
          yield* fs.copy(templatePath, profilePath)
          yield* Effect.logDebug(`Profile created for ${browserId} from template`, template)
        }
      }

      const minimumLogLevel = yield* References.MinimumLogLevel
      const encoded = Schema.encodeSync(InitPayloadFromUrlParam)({
        browserId,
        port,
        minimumLogLevel,
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
}) {
  static layer = Layer.effect(this, this.make())
}
