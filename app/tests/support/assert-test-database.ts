/**
 * The guard between a suite that writes rows and the real `synapse` database (AC7). The
 * integration global setup, the Playwright global setup, and `db:migrate:test` call it before
 * anything else (after finance-stack/app/tests/support/assert-test-database.ts).
 *
 * Both variables must name `synapse_test` exactly: DATABASE_URL is what the app and the tests
 * that act as it connect to, and PGDATABASE is the superuser's. A substring match would pass
 * `synapse_test_copy`, and only the database name is printed, never the URL with its password.
 */
export const TEST_DATABASE = "synapse_test";

type Env = Record<string, string | undefined>;

function urlDatabase(url: string | undefined): string {
  if (!url) return "nothing (it's not set)";
  try {
    return decodeURIComponent(new URL(url).pathname.slice(1)) || "no database";
  } catch {
    return "nothing (it isn't a URL)";
  }
}

export function assertTestDatabase(env: Env, suite: string): void {
  const fromUrl = urlDatabase(env.DATABASE_URL);
  if (fromUrl === TEST_DATABASE && env.PGDATABASE === TEST_DATABASE) return;

  throw new Error(
    `${suite}: DATABASE_URL and PGDATABASE must both name ${TEST_DATABASE}. ` +
      `DATABASE_URL names ${fromUrl}, and PGDATABASE ` +
      (env.PGDATABASE ? `is ${env.PGDATABASE}. ` : "is not set. ") +
      "Copy app/.env.local.example to app/.env.local and fill it in.",
  );
}
