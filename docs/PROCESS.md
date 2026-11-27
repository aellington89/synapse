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
`continue-on-error`: `check-process.mjs`, then in `app/` `npm ci`, `format:check`, `lint`,
`typecheck`, `check:audit`, `npm test` (every Vitest project), the Playwright browser install,
and `test:e2e`. Locally, the Verify fact runs the static checks and Vitest, and the End-to-end
tests fact runs Playwright. The audit needs the npm registry, so it isn't in the Verify fact:
`npm --prefix app run check:audit` runs it.

| Level              | Tool                                                                                                     | Where it runs                    |
| ------------------ | -------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Static             | `check-process.mjs`, then in `app/`: Prettier (`format:check`), ESLint (`lint`), `tsc` (`typecheck`)     | Locally, and the CI `Verify` job |
| Dependency audit   | `npm audit --omit=dev` (`check:audit`), against `app/.audit-allowlist` (Upgrades)                        | Locally, and the CI `Verify` job |
| Unit and component | Vitest: the `unit` project (`tests/unit/**/*.test.ts`, node) and `jsdom` (`tests/unit/**/*.test.tsx`)    | Locally, and the CI `Verify` job |
| Integration        | Vitest's `integration` project (`tests/integration/**/*.test.ts`), empty until #4's part 3 adds Postgres | Locally, and the CI `Verify` job |
| End to end         | Playwright (`e2e/`), Chromium, against `next build && next start` on `E2E_PORT` (default 3102)           | Locally, and the CI `Verify` job |
| Release QA         | n/a: nothing is released yet                                                                             | Before publishing                |

## Release

n/a: nothing is built or released yet. When it is, add a release workflow on `v*` tags that runs
`node scripts/dev-process/release.mjs verify "$GITHUB_REF_NAME"` first, and describe its targets
and release QA here.

## Upgrades

Dependabot (`.github/dependabot.yml`) tracks two ecosystems:

- **GitHub Actions**, monthly, in one group. Their updates merge automatically once CI passes.
- **npm** (`app/`), weekly. Minor and patch updates arrive as two groups, dev and runtime
  dependencies, and each major as a PR of its own. Every npm update waits for review: the
  `Merge Dependabot update` job merges GitHub Actions updates only. The `typescript`, `eslint`,
  and `@types/node` majors are ignored. The first two are held for the reasons in the
  `//typescript` and `//eslint` notes in `app/package.json`. `@types/node` moves with the Node
  major in CI and the images, by hand, in the same change.

The `Dependency audit (runtime)` step in `Verify` (`npm run check:audit`) fails on any HIGH or
CRITICAL advisory in the runtime tree, `npm audit --omit=dev`. Dev dependencies don't ship in the
app, so they aren't audited. Fix an advisory in this order:

1. Upgrade the package, or the dependency that brings it in, to a fixed version.
2. When no upgrade reaches one, add an `overrides` entry in `app/package.json` that lifts the
   package to a fixed version, with why and when to drop it in an `//overrides` note.
3. Only when no fixed version can be reached, add a dated entry to `app/.audit-allowlist`, whose
   header says how to write one. The entry stops working on its expiry date, and the gate warns
   about entries that no longer match an advisory.

## Automation

| Automation                    | Trigger                                                                    | Lives in                   |
| ----------------------------- | -------------------------------------------------------------------------- | -------------------------- |
| CI: `Verify`                  | Every pull request, and every push to `main` (its steps are under Testing) | `.github/workflows/ci.yml` |
| CI: `Merge Dependabot update` | A Dependabot PR for GitHub Actions, after Verify                           | `.github/workflows/ci.yml` |
| Dependabot                    | Monthly for GitHub Actions, weekly for npm (`app/`)                        | `.github/dependabot.yml`   |
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

- Postgres, the integration tests, and a way to run the whole app (Compose) arrive with #4's
  part 3.
