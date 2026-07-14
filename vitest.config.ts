import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "jsdom",
    // @ts-ignore - environmentMatchGlobs is available in vitest 4.1.10 at runtime
    environmentMatchGlobs: [["lib/**/*.test.ts", "node"]],
    include: ["lib/**/*.test.ts", "components/**/*.test.tsx"],
  },
} as any);
