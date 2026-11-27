#!/usr/bin/env node
// Checks the docs: relative links and #anchors resolve, repo paths mentioned in prose exist,
// headings are sentence case, and spellings are American (docs/PROCESS.md, Documentation).
// The checks are dev_process's (scripts/docs-lint.mjs is a copy of its lib/docs-lint.mjs).
// Run it from the repository root:
//
//   node scripts/check-docs.mjs

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDocsLint, isRecordOrPlan, managedFiles } from './docs-lint.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
// The shared process lives in a clone on a developer's machine, and node_modules is installed
// only where `npm ci` ran, so a mention of either is checked only where it exists (not in CI).
const devProcess = `${process.env.HOME}/.claude/dev_process/`
const lint = createDocsLint({
  root: ROOT,
  pathRoots: ['app', 'docs', 'scripts', '.github'],
  properNouns: ['Synapse', 'PostgreSQL'],
  // Phase names, as the milestones and design titles spell them (CLAUDE.md, Roadmap).
  namedTerms: ["Synapse's", 'Next.js', 'Sigma.js', 'Base UI', 'Phase 1: Core graph', 'Phase 2: Ingestion'],
  skipPath: (path) => path.startsWith('app/node_modules/') && !existsSync(join(ROOT, 'app/node_modules')),
  aliases: existsSync(devProcess) ? [['~/.claude/dev_process/', devProcess]] : [],
})

const skip = managedFiles(ROOT)
const markdown = lint
  .walk(ROOT, (f) => f.endsWith('.md'))
  .filter((f) => !skip.has(lint.repoPath(f)) && !/^(\.claude|app\/node_modules)\//.test(lint.repoPath(f)))
for (const abs of markdown) lint.checkMarkdown(abs)
process.exit(lint.finish('check-docs', `${markdown.length} markdown files ok`))
