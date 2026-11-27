import { DatabaseError } from "pg";

import { appRole, superuser, withClient } from "./pg";

export const APP_PASSWORD_MISMATCH =
  "SYNAPSE_APP_DB_PASSWORD in app/.env.local doesn't match the running stack's; copy it from .env";

type Env = Record<string, string | undefined>;

/**
 * Stops a local run of migrate.sh from locking the running stack out (AC7). migrate.sh sets
 * synapse_app's password on every run, and roles are cluster-wide, so a stale
 * SYNAPSE_APP_DB_PASSWORD in app/.env.local would leave synapse-app unable to connect until the
 * next `up`. Call it before anything runs migrate.sh.
 *
 * It connects as synapse_app to `postgres`, where PUBLIC keeps CONNECT: the grants revoke it on
 * synapse_test, which may not exist yet either. Only 28P01 (a wrong password) is a mismatch.
 * With no role yet, there's nothing to lock out. With CI set, it does nothing: CI's cluster is a
 * disposable service container.
 */
export async function assertAppPasswordMatches(env: Env): Promise<void> {
  if (env.CI) return;

  const roleExists = await withClient(superuser(env, "postgres"), async (client) => {
    const { rowCount } = await client.query("SELECT 1 FROM pg_roles WHERE rolname = 'synapse_app'");
    return rowCount === 1;
  });
  if (!roleExists) return;

  try {
    await withClient(appRole(env, "postgres"), () => Promise.resolve());
  } catch (error) {
    if (error instanceof DatabaseError && error.code === "28P01") {
      throw new Error(APP_PASSWORD_MISMATCH, { cause: error });
    }
    throw error;
  }
}
