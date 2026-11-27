import { Client, type ClientConfig } from "pg";

type Env = Record<string, string | undefined>;

// Every field is spelled out, so nothing falls back to pg's own reading of PG* in process.env:
// the guards are handed an env on purpose, and the tests hand them one that differs from it.

/** The superuser, from PGHOST, PGPORT, PGUSER, and PGPASSWORD. */
export function superuser(env: Env, database: string): ClientConfig {
  return {
    host: env.PGHOST,
    port: Number(env.PGPORT),
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
