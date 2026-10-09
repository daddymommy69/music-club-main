import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Small pure-logic test suite (2026-10-09 audit item — see
 * claude/audit-2026-10-08.md and claude/next-build.md). Deliberately
 * scoped to the handful of modules with zero DB/network dependency
 * (cycle.ts, songMatch.ts, top10.ts, spotifyId.ts) — this sandbox has
 * no live Postgres/Spotify access, and nothing here needs it. The one
 * thing vitest needs that isn't automatic: this project's own `@/*` ->
 * `src/*` path alias (tsconfig.json), mirrored here so test files can
 * import the same way the app's own code does.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
