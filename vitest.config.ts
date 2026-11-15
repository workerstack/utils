import { defineConfig } from "@workerstack/repo/vitest";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
