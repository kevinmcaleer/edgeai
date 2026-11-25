import { defineConfig } from "vitest/config";

// base "./" so the built app works from any folder, including GitHub Pages at /edgeai/.
export default defineConfig({
  base: "./",
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
  },
});
