# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

Synapse is a new project. Its stack and architecture aren't chosen yet: the repository holds
only the dev process so far. When the stack is chosen, add its commands to the Dev process table
below, its architecture and conventions here (or run `/init`), and its test levels to
`docs/PROCESS.md`.

## Commands

- **Verify:** `node scripts/dev-process/check-process.mjs` (the only gate until there's code).

## Dev process

@~/.claude/dev_process/CONVENTIONS.md

This project follows the shared development process in `~/.claude/dev_process` (from
`aellington89/dev_process`; the version of its synced files is in `.dev-process.json`). Its
additions, and where it differs from the shared process, are in `docs/PROCESS.md`. The skills
read these facts:

| Fact              | Value                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| Default branch    | `main`                                                                                            |
| Verify            | `node scripts/dev-process/check-process.mjs`                                                      |
| Unit tests        | n/a: no code or stack yet                                                                         |
| End-to-end tests  | n/a: no code or stack yet                                                                         |
| Run the app       | n/a: no code or stack yet                                                                         |
| Format            | n/a: no formatter chosen yet                                                                      |
| Next version      | `node scripts/dev-process/release.mjs next`                                                       |
| Prepare a release | `node scripts/dev-process/release.mjs prepare`, then n/a: no version file until a stack is chosen |
| User guide        | n/a: no user guide yet                                                                            |
| Roadmap           | n/a: no phases defined yet; they'll be milestones on GitHub, planned with `/design phase`         |
| GitHub project    | https://github.com/users/aellington89/projects/31                                                 |
