import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";

const testEnvFile = path.resolve(import.meta.dirname, ".env.test");
if (existsSync(testEnvFile)) process.loadEnvFile(testEnvFile);

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["./test/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
