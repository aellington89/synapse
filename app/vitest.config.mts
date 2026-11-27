import { defineConfig } from "vitest/config";

export default defineConfig({
  // `@/` imports resolve through tsconfig.json's `paths`, as in the app.
  resolve: { tsconfigPaths: true },
  test: {
    // Split by what each project needs, as finance-stack's are: no DOM, a DOM, a database
    // (finance-stack/app/vitest.config.ts). `*.test.ts` and `*.test.tsx` are disjoint, so no
    // file runs in two projects.
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "jsdom",
          include: ["tests/unit/**/*.test.tsx"],
          environment: "jsdom",
          setupFiles: ["tests/jsdom/vitest-setup.ts"],
        },
      },
      {
        // Against synapse_test, migrated by `npm run db:migrate:test` (CI runs migrate.sh). The
        // global setup loads app/.env.local and refuses any other database. One file at a time,
        // because they share the database and migrate.test.ts reruns migrate.sh.
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          globalSetup: ["tests/integration/setup.ts"],
          fileParallelism: false,
        },
      },
    ],
  },
});
