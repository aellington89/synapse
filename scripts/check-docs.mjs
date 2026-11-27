#!/usr/bin/env node
// Checks the docs: relative links and #anchors resolve, repo paths mentioned in prose exist,
// headings are sentence case, and spellings are American. The checks are dev_process's
// (scripts/docs-lint.mjs is a copy of its lib/docs-lint.mjs; see
// ~/.claude/dev_process/standards/documentation.md#automated-checks). Run it from the
// repository root:
//
//   node scripts/check-docs.mjs

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDocsLint, managedFiles } from './docs-lint.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
// The shared process lives in a clone on a developer's machine, and node_modules is installed
// only where `npm ci` ran, so a mention of either is checked only where it exists (not in CI).
const devProcess = join(homedir(), '.claude', 'dev_process') + '/'
const lint = createDocsLint({
  root: ROOT,
  pathRoots: ['app', 'docs', 'scripts', '.github'],
  properNouns: ['Synapse', 'PostgreSQL'],
  // Phase names, as the milestones and design titles spell them (CLAUDE.md, Roadmap).
  namedTerms: [
    "Synapse's",
    'Next.js',
    'Sigma.js',
    'Base UI',
    'Phase 1: Core graph',
    'Phase 2: Ingestion',
  ],
  skipPath: (path) =>
    path.startsWith('app/node_modules/') && !existsSync(join(ROOT, 'app/node_modules')),
  aliases: existsSync(devProcess) ? [['~/.claude/dev_process/', devProcess]] : [],
})

// Only tracked files: an untracked clone (CI checks dev_process out to .dev-process/) or a
// scratch note is not part of the docs.
const skip = managedFiles(ROOT)
let tracked
try {
  tracked = execFileSync('git', ['ls-files', '-z', '--', '*.md'], { cwd: ROOT, encoding: 'utf8' })
} catch {
  console.error('check-docs: needs a git checkout, with git installed, to list the tracked docs')
  process.exit(1)
}
const markdown = tracked
  .split('\0')
  // A tracked file that is deleted or renamed in the working tree is not there to read.
  .filter((f) => f && !skip.has(f) && !f.startsWith('.claude/') && existsSync(join(ROOT, f)))
  .map((f) => join(ROOT, f))
for (const abs of markdown) lint.checkMarkdown(abs)
process.exit(lint.finish('check-docs', `${markdown.length} markdown files ok`))
