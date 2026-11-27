import { Client, type ClientConfig } from "pg";

type Env = Record<string, string | undefined>;

// Every field comes from the env passed in, not process.env: the guards are handed an env on
// purpose, and the tests hand them one that differs from it. A field the env lacks is left unset,
// and pg then fills it from process.env's PG* or its own default.

/** The superuser, from PGHOST, PGPORT, PGUSER, and PGPASSWORD. */
export function superuser(env: Env, database: string): ClientConfig {
  return {
    host: env.PGHOST,
    port: env.PGPORT ? Number(env.PGPORT) : undefined,
    user: env.PGUSER,
    password: env.PGPASSWORD,
    database,
  };
}

/** The app's role, synapse_app, with SYNAPSE_APP_DB_PASSWORD, on the superuser's host and port. */
export function appRole(env: Env, database: string): ClientConfig {
  return {
    ...superuser(env, database),
    user: "synapse_app",
    password: env.SYNAPSE_APP_DB_PASSWORD,
  };
}

/** Connects, runs `fn`, and always disconnects. */
export async function withClient<T>(config: ClientConfig, fn: (client: Client) => Promise<T>) {
  const client = new Client(config);
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}
