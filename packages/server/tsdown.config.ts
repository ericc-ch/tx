import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["src/cli.ts"],

  target: "esnext",
  platform: "node",

  sourcemap: "inline",
})
