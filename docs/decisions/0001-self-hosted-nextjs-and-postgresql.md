# 0001. Build Synapse as a self-hosted Next.js and PostgreSQL app on the finance-stack pattern

Date: 2026-11-22 · Status: Proposed · Issue: #2

## Context

Synapse holds personal and sensitive data, such as mood, context, and resonance notes, and it
has one user to start with. Its sharing features come last, in Phase 6. finance-stack, kept
under the same dev process, already runs Next.js 16.4.6, PostgreSQL 18.6, Drizzle, Auth.js 5,
and Docker Compose, and has solved deploy, backups, least-privilege roles, secrets, and CI
(`finance-stack/docker-compose.yml:29`, `finance-stack/app/package.json:35-38`,
`finance-stack/README.md:22,33,37`). The research on #2 compared four stacks.

## Decision

Synapse is a self-hosted Docker Compose app:

- a Next.js 16 app with Auth.js username and password sign-in, and no self-registration;
- PostgreSQL 18 with least-privilege roles, and Drizzle migrations;
- Vitest for unit, component, and integration tests, and Playwright for end-to-end tests.

The default posture is a trusted network (localhost, a LAN, or a VPN), with an optional Caddy
edge profile for TLS, as finance-stack has.

## Consequences

- finance-stack's patterns and scripts are reused, so setup is fast, and fixes in one repository
  carry over to the other.
- Data stays on your own host. The only things that leave it in Phase 1 are search queries and
  ids sent to the metadata providers.
- Reaching Synapse from outside needs a VPN or the edge profile.
- Phase 6 adds accounts and visibility to this app rather than replacing it.
- The host needs Docker, and Synapse is heavier than a single SQLite file.

## Alternatives considered

- **Local-first, with SQLite or Tauri:** a smaller footprint, but it's a new stack whose deploy,
  auth, and test patterns all start over, and multi-user sharing would mean a migration to a
  server database.
- **A native graph database, such as Neo4j:** Cypher is pleasant for paths, but it's another
  stateful JVM service with its own backups, and the scale doesn't need it (ADR 0002).
- **A hosted multi-tenant service on Supabase or Neon:** reachable everywhere, but accounts,
  tenancy, and privacy controls would all land in Phase 1, sensitive data would sit with a third
  party from the start, there's a running cost, and a public product falls outside TMDB's and
  IGDB's free non-commercial terms.
