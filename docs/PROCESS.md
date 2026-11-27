# Synapse process

Synapse follows the shared development process in `~/.claude/dev_process/PROCESS.md`. This page
adds only what's specific to Synapse, and records where it does things its own way. The facts
the process needs, such as commands and the default branch, are in the Dev process table in
`CLAUDE.md`.

## Differences from the shared process

None. Synapse is a new repository and starts on the shared process as it is.

## Definition of Ready additions

None yet.

## Definition of Done additions

None yet.

## Code review additions

None yet.

## Testing

Every level below runs in the CI `Verify` job, on Node 26, each check as its own step with no
`continue-on-error`: `check-process.mjs`, `check-docs.mjs`, then in `app/` `npm ci`,
`format:check`, `lint`, `typecheck`, `check:audit`, `migrate.sh` (both databases, on a
`postgres:18.6` service container), `npm test` (every Vitest project), the Playwright browser
install, and `test:e2e`. Locally, the Verify fact runs the static checks and Vitest, and the
End-to-end tests fact runs Playwright. Vitest's integration project needs the stack's Postgres up
and migrated (`docker compose up -d --build postgres migrate`), `app/.env.local` from
`app/.env.local.example`, and psql 15 or later on the host, since `migrate.test.ts` runs
`migrate.sh` there. Its global setup refuses to run unless `DATABASE_URL` and `PGDATABASE` both
name `synapse_test`, so no test touches the real `synapse` database. The audit needs the npm
registry, so it isn't in the Verify fact: `npm --prefix app run check:audit` runs it. `check-docs.mjs` checks
mentions of `~/.claude/dev_process/` and `app/node_modules/` only where they exist, so CI (which
has no dev_process clone and runs it before `npm ci`) skips them and a local run covers them.

| Level              | Tool                                                                                                                   | Where it runs                    |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Static             | `check-process.mjs`, `check-docs.mjs`, then in `app/`: Prettier (`format:check`), ESLint (`lint`), `tsc` (`typecheck`) | Locally, and the CI `Verify` job |
| Dependency audit   | `npm audit --omit=dev` (`check:audit`), against `app/.audit-allowlist` (Upgrades)                                      | Locally, and the CI `Verify` job |
| Unit and component | Vitest: the `unit` project (`tests/unit/**/*.test.ts`, node) and `jsdom` (`tests/unit/**/*.test.tsx`)                  | Locally, and the CI `Verify` job |
| Integration        | Vitest's `integration` project (`tests/integration/**/*.test.ts`), against `synapse_test`, one file at a time          | Locally, and the CI `Verify` job |
| End to end         | Playwright (`e2e/`), Chromium, against `next build && next start` on `E2E_PORT` (default 3102)                         | Locally, and the CI `Verify` job |
| Release QA         | n/a: nothing is released yet                                                                                           | Before publishing                |

## Release

n/a: nothing is built or released yet. When it is, add a release workflow on `v*` tags that runs
`node scripts/dev-process/release.mjs verify "$GITHUB_REF_NAME"` first, and describe its targets
and release QA here.

## Upgrades

Dependabot (`.github/dependabot.yml`) tracks four ecosystems:

- **GitHub Actions**, monthly, in one group. Their updates merge automatically once CI passes.
- **npm** (`app/`), weekly. Minor and patch updates arrive as two groups, dev and runtime
  dependencies, and each major as a PR of its own. Dependabot counts a 0.x minor as a minor,
  though the caret treats it as breaking, so a `next-themes` or `class-variance-authority`
  release outside its range arrives in the runtime group. Every npm update waits for review: the
  `Merge Dependabot update` job merges GitHub Actions updates only. The `typescript`, `eslint`,
  and `@types/node` majors are ignored. The first two are held for the reasons in the
  `//typescript` and `//eslint` notes in `app/package.json`. `@types/node` moves with the Node
  major in CI and the images, by hand, in the same change.
- **Docker**, weekly: the `node` base image in `app/Dockerfile` (`docker`, `/app`) and the
  `postgres` image in `docker-compose.yml` (`docker-compose`, `/`). They wait for review, like
  npm. Dependabot doesn't read the workflow's service containers, so a `postgres` bump changes
  the Postgres service in `.github/workflows/ci.yml` to the same tag, in the same PR. A Node major
  changes the images, CI's `node-version`, and `@types/node` together, by hand.

The `Dependency audit (runtime)` step in `Verify` (`npm run check:audit`) fails on any HIGH or
CRITICAL advisory in the runtime tree, `npm audit --omit=dev`. That leaves out dev dependencies,
except one that a runtime package also names as an optional peer: npm keeps those, so
`@playwright/test` (an optional peer of `next`) and `@types/react` are audited, with what they
bring in. Fix an advisory in this order:

1. Upgrade the package, or the dependency that brings it in, to a fixed version.
2. When no upgrade reaches one, add an `overrides` entry in `app/package.json` that lifts the
   package to a fixed version, with why and when to drop it in an `//overrides` note.
3. Only when no fixed version can be reached, add a dated entry to `app/.audit-allowlist`, whose
   header says how to write one. The entry stops working on its expiry date, in UTC, and the gate
   warns about entries that no longer match an advisory.

## Automation

| Automation                    | Trigger                                                                    | Lives in                   |
| ----------------------------- | -------------------------------------------------------------------------- | -------------------------- |
| CI: `Verify`                  | Every pull request, and every push to `main` (its steps are under Testing) | `.github/workflows/ci.yml` |
| CI: `Merge Dependabot update` | A Dependabot PR for GitHub Actions, after Verify                           | `.github/workflows/ci.yml` |
| Dependabot                    | Monthly for GitHub Actions, weekly for npm (`app/`) and Docker             | `.github/dependabot.yml`   |
| Shared workflows (synced)     | See `.dev-process.json`                                                    | `.github/workflows/`       |

## Repository setup

The `main` ruleset requires a pull request, allows squash merges only, blocks force pushes and
deletion, and requires the status checks `Verify` and `Title and description`. Repository
admins can bypass it for emergencies. **Allow auto-merge** is on, so the Dependabot merge job's
`gh pr merge --auto --squash` waits for both checks. The repository is public, with secret
scanning and push protection on.

Secrets: `DEV_PROCESS_SSH_KEY` holds the private half of the read-only `synapse-ci` deploy key
on `dev_process`. `CLAUDE_CODE_OAUTH_TOKEN` comes from `/install-github-app`, as the shared setup
describes.

## Terms

None yet.

| Term | Meaning |
| ---- | ------- |

## Known gaps

- The app's container, and so a way to run the whole app with Compose, arrives with #4's part 4.
