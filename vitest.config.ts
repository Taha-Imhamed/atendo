import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "./shared"),
      "@": path.resolve(__dirname, "./client/src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: "./vitest.setup.ts",
    include: ["server/**/*.test.ts"],
  },
});
