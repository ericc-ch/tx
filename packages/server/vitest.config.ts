import { defineProject } from "vitest/config"

export default defineProject({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    env: {
      DISCORD_WEBHOOK_URL: "https://discord.com/api/webhooks/0/test",
    },
  },
})
