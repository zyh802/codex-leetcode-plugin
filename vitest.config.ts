import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "ui/src"),
      "@contracts": path.resolve(import.meta.dirname, "src/contracts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "ui/src/**/*.test.ts", "ui/src/**/*.test.tsx"],
    clearMocks: true,
  },
});
