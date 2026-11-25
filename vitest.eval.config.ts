import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Separate configuration for the offline RAG evaluation.
 *
 * `pnpm test` deliberately does not include these files: evaluation is not
 * part of the runtime test suite. Run `pnpm run eval:rag` to execute it.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["artifacts/api-server/eval/**/*.eval.test.ts"],
    setupFiles: ["artifacts/api-server/test/setup.ts"],
    clearMocks: true,
    restoreMocks: true,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@workspace/db": path.resolve(rootDir, "lib/db/src/index.ts"),
      "@workspace/api-zod": path.resolve(rootDir, "lib/api-zod/src/index.ts"),
    },
  },
});
