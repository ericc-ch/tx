import { defineConfig, type UserConfigExport } from "tsdown"

const config: UserConfigExport = defineConfig({
  entry: ["src/cli.ts"],

  target: "esnext",
  platform: "node",

  sourcemap: "inline",
})

export default config
