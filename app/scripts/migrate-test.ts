// `npm run db:migrate:test`: how you migrate locally. It runs migrate.sh for synapse_test only,
// after the two guards (AC7): app/.env.local must name synapse_test, and its
// SYNAPSE_APP_DB_PASSWORD must match the running stack's, or migrate.sh would lock that stack's
// app out. Either failing stops it before anything changes.

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { assertAppPasswordMatches } from "../tests/support/app-password";
import { assertTestDatabase, TEST_DATABASE } from "../tests/support/assert-test-database";
import { loadLocalEnv } from "../tests/support/load-env";

async function main(): Promise<number> {
  try {
    loadLocalEnv();
    assertTestDatabase(process.env, "db:migrate:test");
    await assertAppPasswordMatches(process.env);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return 1;
  }

  const run = spawnSync("bash", [join(dirname(fileURLToPath(import.meta.url)), "migrate.sh")], {
    env: { ...process.env, SYNAPSE_DATABASES: TEST_DATABASE },
    stdio: "inherit",
  });
  return run.status ?? 1;
}

main().then((code) => {
  process.exitCode = code;
});
