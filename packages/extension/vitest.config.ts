import { defineProject } from "vitest/config"

export default defineProject({
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.ts"],
  },
})
