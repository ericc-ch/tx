import { execSync } from "node:child_process"
import { defineConfig } from "wxt"

let heliumPath: string

try {
  heliumPath = execSync("command -v helium").toString().trim()
} catch {
  if (process.env.HELIUM_PATH) {
    heliumPath = process.env.HELIUM_PATH
  } else {
    throw new Error("Could not find Helium binary. Install helium or set HELIUM_PATH.")
  }
}

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: "src",
  manifestVersion: 2,
  browser: "chrome",
  modules: ["@wxt-dev/module-solid"],
  manifest: {
    permissions: ["storage", "tabs"],
    host_permissions: ["http://127.0.0.1/*", "http://localhost/*"],
  },
  dev: {
    server: {
      host: "localhost",
    },
  },
  webExt: {
    disabled: false,
    binaries: {
      chrome: heliumPath,
    },
  },
})
