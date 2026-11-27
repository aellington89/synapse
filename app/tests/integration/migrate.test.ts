// migrate.sh against synapse_test only: a second run changes nothing (AC2), a password that
// isn't URL-safe or is empty stops it before anything changes (AC7), and, on CI's disposable
// cluster, a new SYNAPSE_APP_DB_PASSWORD takes effect on the next run (AC2).

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { join } from "node:path";

import { DatabaseError } from "pg";
import { beforeAll, describe, expect, it } from "vitest";

import { assertAppPasswordMatches } from "@/tests/support/app-password";
import { appRole, superuser, withClient } from "@/tests/support/pg";

const MIGRATE = join(import.meta.dirname, "../../scripts/migrate.sh");
const DATABASE = "synapse_test";

function migrate(overrides: Record<string, string> = {}) {
  return spawnSync("bash", [MIGRATE], {
    env: { ...process.env, SYNAPSE_DATABASES: DATABASE, ...overrides },
    encoding: "utf8",
  });
}

// What migrate.sh is responsible for, read back from the catalog. pg_roles masks the password,
// whose stored SCRAM salt changes on every run, so it's left out.
const SNAPSHOT = `
  SELECT json_build_object(
    'tables', (SELECT json_agg(t ORDER BY t) FROM (
        SELECT table_schema || '.' || table_name AS t FROM information_schema.tables
         WHERE table_schema IN ('public', 'drizzle')) tables),
    'role', (SELECT row_to_json(r) FROM (
        SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
          FROM pg_roles WHERE rolname = 'synapse_app') r),
    'tableGrants', (SELECT json_agg(g ORDER BY g) FROM (
        SELECT table_schema || '.' || table_name || ' ' || privilege_type AS g
          FROM information_schema.role_table_grants WHERE grantee = 'synapse_app') grants),
    'databaseAcl', (SELECT datacl::text FROM pg_database WHERE datname = current_database()),
    'schemaAcls', (SELECT json_agg(s ORDER BY s) FROM (
        SELECT nspname || ' ' || coalesce(nspacl::text, '') AS s FROM pg_namespace
         WHERE nspname IN ('public', 'drizzle')) schemas),
    'sequenceAcls', (SELECT json_agg(s ORDER BY s) FROM (
        SELECT n.nspname || '.' || c.relname || ' ' || coalesce(c.relacl::text, '') AS s
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE c.relkind = 'S' AND n.nspname IN ('public', 'drizzle')) sequences),
    'defaultAcls', (SELECT json_agg(d ORDER BY d) FROM (
        SELECT defaclobjtype::text || ' ' || defaclacl::text AS d FROM pg_default_acl) defaults),
    'ledger', (SELECT json_agg(hash ORDER BY id) FROM drizzle.__drizzle_migrations)
  ) AS snapshot`;

const snapshot = () =>
  withClient(superuser(process.env, DATABASE), async (client) => {
    const { rows } = await client.query(SNAPSHOT);
    return rows[0].snapshot;
  });

// Connects as synapse_app with `password`; resolves to the SQLSTATE of a refusal, or "ok".
const connectAsApp = (password: string | undefined) =>
  withClient({ ...appRole(process.env, DATABASE), password }, () => Promise.resolve("ok")).catch(
    (error: unknown) => (error instanceof DatabaseError ? error.code : Promise.reject(error)),
  );

describe("migrate.sh", { timeout: 120_000 }, () => {
  beforeAll(async () => {
    // Outside CI, a password that differs from the running stack's would lock it out.
    await assertAppPasswordMatches(process.env);
    const first = migrate();
    expect(first.status, first.stderr).toBe(0);
  }, 120_000);

  it("leaves the users table and the migration ledger in synapse_test", async () => {
    const { tables, ledger } = await snapshot();

    expect(tables).toEqual(["drizzle.__drizzle_migrations", "public.users"]);
    expect(ledger).toHaveLength(1);
  });

  it("changes nothing when it runs again", async () => {
    const before = await snapshot();

    const again = migrate();

    expect(again.status, again.stderr).toBe(0);
    expect(await snapshot()).toEqual(before);
  });

  it.each([
    ["SYNAPSE_APP_DB_PASSWORD", "has@sign"],
    ["SYNAPSE_APP_DB_PASSWORD", "has space"],
    ["SYNAPSE_APP_DB_PASSWORD", ""],
    ["PGPASSWORD", "has/slash"],
  ])("stops, naming %s, when it's %j, before changing anything", async (variable, value) => {
    const before = await snapshot();

    const run = migrate({ [variable]: value });

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain(variable);
    expect(run.stdout).not.toContain(">>>");
    expect(await snapshot()).toEqual(before);
    expect(await connectAsApp(process.env.SYNAPSE_APP_DB_PASSWORD)).toBe("ok");
  });

  it("names the step that failed", () => {
    const run = migrate({ PGPORT: "1" });

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain(`migrate.sh: failed while creating the database ${DATABASE}.`);
  });

  it.each(["postgres", "template1"])("refuses to touch %s", (name) => {
    const run = migrate({ SYNAPSE_DATABASES: name });

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain(`"${name}" is one of Postgres's own databases`);
    expect(run.stdout).not.toContain(">>>");
  });

  // Only on CI's disposable cluster: the role is cluster-wide, so a new password here would lock
  // a running synapse-app out of new connections until its next `up`.
  it.runIf(process.env.CI)("applies a new SYNAPSE_APP_DB_PASSWORD on the next run", async () => {
    const original = process.env.SYNAPSE_APP_DB_PASSWORD!;
    const rotated = `rotated-${randomBytes(12).toString("hex")}`;
    try {
      const run = migrate({ SYNAPSE_APP_DB_PASSWORD: rotated });
      expect(run.status, run.stderr).toBe(0);

      expect(await connectAsApp(rotated)).toBe("ok");
      expect(await connectAsApp(original)).toBe("28P01");
    } finally {
      const restore = migrate({ SYNAPSE_APP_DB_PASSWORD: original });
      expect(restore.status, restore.stderr).toBe(0);
    }
  });
});
