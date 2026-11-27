// What docker-compose.yml publishes and what it calls its containers: Postgres on loopback only
// (AC4), and nothing that clashes with a running finance-stack (AC3).

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

type Service = { container_name?: string; ports?: unknown[] };

const compose = parse(
  readFileSync(join(import.meta.dirname, "../../../docker-compose.yml"), "utf8"),
) as {
  name?: string;
  services: Record<string, Service>;
};
const services = Object.entries(compose.services);

// finance-stack's container names (finance-stack/docker-compose.yml, at e51a9a2).
const FINANCE_STACK = [
  "postgres",
  "finance-migrate",
  "finance-app",
  "importer",
  "pg-backup",
  "metabase",
  "glitchtip",
  "caddy",
];

describe("docker-compose.yml", () => {
  it("names the project synapse", () => {
    expect(compose.name).toBe("synapse");
  });

  it.each(services)("gives %s a synapse- container name", (_, service) => {
    expect(service.container_name).toMatch(/^synapse-/);
    expect(FINANCE_STACK).not.toContain(service.container_name);
  });

  it("publishes Postgres on 127.0.0.1:5434 only", () => {
    expect(compose.services.postgres.ports).toEqual(["127.0.0.1:5434:5432"]);
  });

  it("publishes nothing for migrate", () => {
    expect(compose.services.migrate.ports).toBeUndefined();
  });

  it.each(services)("publishes %s's ports on loopback only, in the short syntax", (_, service) => {
    for (const port of service.ports ?? []) {
      expect(port).toEqual(expect.stringMatching(/^127\.0\.0\.1:\d+:\d+$/));
    }
  });
});
