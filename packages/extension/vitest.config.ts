import path from "node:path"
import { defineProject } from "vitest/config"

export default defineProject({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.ts"],
  },
})
