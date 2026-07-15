import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    // Run tests in Node environment (no browser DOM needed for unit tests)
    environment: "node",
    // Test file patterns
    include: ["src/__tests__/**/*.test.ts"],
    // Coverage configuration
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: [
        "src/lib/services/**",
        "src/lib/ai/recommendation-optimizer.ts",
        "src/lib/ai/schemas.ts",
        "src/lib/automation-engine.ts",
      ],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
