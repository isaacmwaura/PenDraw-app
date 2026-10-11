import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Keep checks modest on a workstation shared with other active projects.
    maxWorkers: 2,
    include: ["server/**/*.test.mjs", "src/**/*.test.{ts,tsx}"],
  },
});
