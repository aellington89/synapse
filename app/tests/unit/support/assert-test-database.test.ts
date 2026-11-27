// The guard that keeps the integration suite, the end-to-end suite, and `db:migrate:test` off the
// real `synapse` database (AC7).

import { describe, expect, it } from "vitest";

import { assertTestDatabase } from "@/tests/support/assert-test-database";

const url = (database: string) =>
  `postgresql://synapse_app:s3cret-password@localhost:5434/${database}`;

const env = (databaseUrl: string | undefined, pgDatabase: string | undefined) => ({
  DATABASE_URL: databaseUrl,
  PGDATABASE: pgDatabase,
});

describe("assertTestDatabase", () => {
  it("passes when both variables name synapse_test", () => {
    expect(() =>
      assertTestDatabase(env(url("synapse_test"), "synapse_test"), "Suite"),
    ).not.toThrow();
  });

  it.each([
    ["DATABASE_URL names synapse", env(url("synapse"), "synapse_test")],
    ["PGDATABASE names synapse", env(url("synapse_test"), "synapse")],
    ["both name synapse", env(url("synapse"), "synapse")],
    ["DATABASE_URL is unset", env(undefined, "synapse_test")],
    ["PGDATABASE is unset", env(url("synapse_test"), undefined)],
    ["DATABASE_URL isn't a URL", env("synapse_test", "synapse_test")],
    [
      "DATABASE_URL names a database that only starts with synapse_test",
      env(url("synapse_test_copy"), "synapse_test"),
    ],
    ["PGDATABASE differs in case", env(url("synapse_test"), "Synapse_Test")],
  ])("throws when %s", (_, values) => {
    expect(() => assertTestDatabase(values, "Integration tests")).toThrow(
      /^Integration tests: DATABASE_URL and PGDATABASE must both name synapse_test\./,
    );
  });

  it("names what each variable holds, without the password", () => {
    let message = "";
    try {
      assertTestDatabase(env(url("synapse"), undefined), "E2E tests");
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain("DATABASE_URL names synapse");
    expect(message).toContain("PGDATABASE is not set");
    expect(message).toContain("app/.env.local.example");
    expect(message).not.toContain("s3cret-password");
  });
});
