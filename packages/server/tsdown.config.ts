import { defineConfig, type UserConfigExport } from "tsdown"

const config: UserConfigExport = defineConfig({
  entry: ["src/cli.ts"],

  target: "esnext",
  platform: "node",

  unbundle: true,
  sourcemap: true,
})

export default config
