import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    globals: true,
    exclude: ["**/node_modules/**", "**/.react-router/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
  },
});
