import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["src/cli.ts"],
  format: "cjs",
  target: "esnext",
  platform: "node",
  dts: false,
  deps: {
    alwaysBundle: [/^@effect\//, /^effect/, "open", "env-paths"],
    onlyBundle: false,
  },
  exe: {
    fileName: "tx",
    targets: [
      { platform: "linux", arch: "x64", nodeVersion: "26.3.0" },
      { platform: "win", arch: "x64", nodeVersion: "26.3.0" },
    ],
    seaConfig: {
      disableExperimentalSEAWarning: true,
      useCodeCache: false,
      useSnapshot: false,
    },
  },
})
