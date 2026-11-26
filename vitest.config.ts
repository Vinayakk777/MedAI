import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "artifacts/api-server/test/**/*.test.ts",
      "artifacts/medical-ai/test/**/*.test.{ts,tsx}",
    ],
    setupFiles: ["artifacts/api-server/test/setup.ts"],
    clearMocks: true,
    restoreMocks: true,
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@workspace/db": path.resolve(rootDir, "lib/db/src/index.ts"),
      "@workspace/api-zod": path.resolve(rootDir, "lib/api-zod/src/index.ts"),
      "@": path.resolve(rootDir, "artifacts/medical-ai/src"),
    },
  },
});
