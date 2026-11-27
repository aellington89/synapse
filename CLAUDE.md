# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

Synapse is a self-hosted, single-user web app for the films, series, games, books, and albums
you've lived with, connected as a graph (`docs/design/phase-1-core-graph.md`). It follows the
finance-stack pattern (ADR 0001): Next.js 16 (App Router, TypeScript, Tailwind 4) with React 19,
and shadcn components on Base UI (ADR 0003). PostgreSQL, Drizzle, and Docker Compose arrive with
#4's part 3, and sign-in with #44.

Layout of `app/`, the only Node package (run npm commands there, or with `npm --prefix app`):

- `app/`: routes (App Router). `app/app/api/health/route.ts` is the public liveness check.
- `components/`: the app's components. `components/ui/` holds shadcn's copied components:
  add one with `npx shadcn add <name>`, then format it. If it imports `cn` from the `cn`
  package, import it from `@/lib/utils` instead. That's finance-stack's helper on `clsx` and
  `tailwind-merge`, the packages #4's spec lists, so components carry over (ADR 0003).
- `lib/`: shared code (`lib/utils.ts` has `cn`).
- `tests/unit/`: Vitest, `*.test.ts` in node and `*.test.tsx` in jsdom; `tests/integration/`
  (Postgres) starts with #4's part 3. `e2e/`: Playwright, against the production build on
  `E2E_PORT` (default 3102).

Outside `app/`, `scripts/check-docs.mjs` is the docs check (links, repo paths, sentence-case
headings, American spelling), on `scripts/docs-lint.mjs`: a copy of dev_process's
`lib/docs-lint.mjs`, refreshed by hand when that changes.

Conventions:

- Next.js 16 differs from older versions: read the guide in `app/node_modules/next/dist/docs/`
  before using an API you're unsure of, and heed deprecation notices.
- Node 26, in CI and (from part 3) the images. TypeScript is held on `~6.0` and ESLint on `^9`,
  for the reasons in `app/package.json`'s `//typescript` and `//eslint` notes.
- Ports: 3002 for `npm run dev`, `npm start`, and the app container; 3102 for the end-to-end
  suite.

## Commands

- **Verify:** `node scripts/dev-process/check-process.mjs && node scripts/check-docs.mjs && npm --prefix app run verify`
  (the docs check, Prettier, ESLint, `tsc`, and Vitest).
- **Format:** `npm --prefix app run format`.
- **Unit and component tests:** `npm --prefix app run test:unit`.
- **End-to-end tests:** `npm --prefix app run test:e2e` (builds first; the first run needs
  `npx playwright install chromium` in `app/`).
- **Dev server:** `npm --prefix app run dev`, on `http://localhost:3002`.

## Dev process

@~/.claude/dev_process/CONVENTIONS.md

This project follows the shared development process in `~/.claude/dev_process` (from
`aellington89/dev_process`; the version of its synced files is in `.dev-process.json`). Its
additions, and where it differs from the shared process, are in `docs/PROCESS.md`. The skills
read these facts:

| Fact              | Value                                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| Default branch    | `main`                                                                                                     |
| Verify            | `node scripts/dev-process/check-process.mjs && node scripts/check-docs.mjs && npm --prefix app run verify` |
| Unit tests        | `npm --prefix app run test:unit`                                                                           |
| End-to-end tests  | `npm --prefix app run test:e2e`                                                                            |
| Run the app       | n/a: until #4's part 3 adds Compose (`npm --prefix app run dev` serves the shell)                          |
| Format            | `npm --prefix app run format`                                                                              |
| Next version      | `node scripts/dev-process/release.mjs next`                                                                |
| Prepare a release | `node scripts/dev-process/release.mjs prepare`, then n/a: no version bump until 1.18 (#21)                 |
| User guide        | n/a: no user guide yet                                                                                     |
| Roadmap           | Milestones `Phase <N>: <theme>` on GitHub, each planned in `docs/design/phase-<N>-<slug>.md`               |
| GitHub project    | https://github.com/users/aellington89/projects/31                                                          |
