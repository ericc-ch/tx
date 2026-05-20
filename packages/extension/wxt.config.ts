import { execSync } from "node:child_process"
import { defineConfig } from "wxt"

let firefoxPath: string

try {
  firefoxPath = execSync("command -v firefox").toString().trim()
} catch {
  if (process.env.FIREFOX_PATH) {
    firefoxPath = process.env.FIREFOX_PATH
  } else {
    throw new Error("Could not find Firefox binary. Install firefox or set FIREFOX_PATH.")
  }
}

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifestVersion: 2,
  browser: "firefox",
  modules: ["@wxt-dev/module-solid"],
  manifest: {
    host_permissions: ["http://127.0.0.1/*", "http://localhost/*"],
  },
  dev: {
    server: {
      host: "127.0.0.1",
      origin: "http://127.0.0.1:3000",
    },
  },
  webExt: {
    disabled: false,
    binaries: {
      firefox: firefoxPath,
    },
  },
})
