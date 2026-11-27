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
        // Empty until #4's part 3 adds Postgres and the tests that need it.
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          fileParallelism: false,
        },
      },
    ],
  },
});
