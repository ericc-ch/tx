import { defineConfig } from "wxt"

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
    disabled: true,
  },
})
