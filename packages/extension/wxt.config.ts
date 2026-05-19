import { execSync } from "node:child_process"
import { defineConfig } from "wxt"

let chromePath: string

try {
  chromePath = execSync("command -v helium").toString().trim()
} catch {
  if (process.env.CHROME_PATH) {
    chromePath = process.env.CHROME_PATH
  } else {
    throw new Error(
      "Could not find Chrome binary. Install helium or set CHROME_PATH.",
    )
  }
}

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifestVersion: 2,
  modules: ["@wxt-dev/module-solid"],
  manifest: {
    host_permissions: ["http://127.0.0.1:3847/*"],
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
      chrome: chromePath,
    },
  },
})
