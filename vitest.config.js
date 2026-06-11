// Standalone test config — deliberately does NOT import vite.config.js, so the
// app's build config (owned elsewhere) and the test setup stay decoupled.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.js"],
    setupFiles: ["./vitest.setup.js"],
    unstubGlobals: true,
  },
});
