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

None yet. Add the stack's own checks here once it's chosen.

## Testing

The stack isn't chosen yet, so only the process check runs. Fill in each level when it is.

| Level              | Tool                                         | Where it runs                    |
| ------------------ | -------------------------------------------- | -------------------------------- |
| Static             | `node scripts/dev-process/check-process.mjs` | Locally, and the CI `Verify` job |
| Unit and component | n/a: no code yet                             | n/a                              |
| Integration        | n/a: no code yet                             | n/a                              |
| End to end         | n/a: no code yet                             | n/a                              |
| Release QA         | n/a: nothing is released yet                 | Before publishing                |

## Release

n/a: nothing is built or released yet. When it is, add a release workflow on `v*` tags that runs
`node scripts/dev-process/release.mjs verify "$GITHUB_REF_NAME"` first, and describe its targets
and release QA here.

## Upgrades

Only GitHub Actions are tracked so far (`.github/dependabot.yml`), monthly, and their updates
merge automatically once CI passes. Add an entry for each package ecosystem when the stack
lands, and list here the packages and groups that always wait for review.

## Automation

| Automation                    | Trigger                                          | Lives in                   |
| ----------------------------- | ------------------------------------------------ | -------------------------- |
| CI: `Verify`                  | Every pull request, and every push to `main`     | `.github/workflows/ci.yml` |
| CI: `Merge Dependabot update` | A Dependabot PR for GitHub Actions, after Verify | `.github/workflows/ci.yml` |
| Dependabot                    | Monthly, GitHub Actions                          | `.github/dependabot.yml`   |
| Shared workflows (synced)     | See `.dev-process.json`                          | `.github/workflows/`       |

## Repository setup

The branch ruleset for `main` should require the status checks `Verify` and `Title and
description`. It isn't in place yet: GitHub only allows rulesets, and **Allow auto-merge**, on a
private repository with GitHub Pro (see Known gaps). Until then, the Dependabot merge job's
`gh pr merge --auto --squash` merges as soon as `Verify` passes.

Secrets: `DEV_PROCESS_SSH_KEY` holds the private half of the read-only `synapse-ci` deploy key
on `dev_process`. `CLAUDE_CODE_OAUTH_TOKEN` comes from `/install-github-app`, as the shared setup
describes.

## Terms

None yet.

| Term | Meaning |
| ---- | ------- |

## Known gaps

- The stack isn't chosen, so there are no tests, formatter, or app commands yet.
- No branch ruleset: the repository is private on GitHub Free, which doesn't allow rulesets
  or auto-merge. Nothing enforces PRs or required checks on `main` until the repository is
  public or on GitHub Pro.
