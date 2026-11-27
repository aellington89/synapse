// Documentation checks for dev_process's own files (scripts/check.mjs), and for any project
// that wants them (standards/documentation.md#automated-checks). Create a linter, run the
// checks you want over your files, add your own, and call finish():
//
//   import { createDocsLint } from './docs-lint.mjs'
//   const lint = createDocsLint({ root: process.cwd(), pathRoots: ['docs', 'src'] })
//   for (const file of lint.markdownFiles()) lint.checkMarkdown(file)
//   process.exit(lint.finish('check-docs'))
//
// Placeholders (`<n>`, `NNNN`, globs) are ignored, fenced code is never checked for paths or
// style, and blockquotes (where examples live) are not checked for paths.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'

// Capitalized words that may follow the first word of a heading. Projects add their own.
const BASE_NAMED_TERMS = [
  'Definition of Ready',
  'Definition of Done',
  'Claude Code',
  'GitHub Actions',
]
const BASE_PROPER_NOUNS = [
  'Claude',
  'GitHub',
  'Dependabot',
  'Mermaid',
  'Prettier',
  'ESLint',
  'TypeScript',
  'Node',
  'Windows',
  'Linux',
  'Phase',
]

const BRITISH = [
  [/\b(behaviour|colour|favour|honour|labour)(s|ed|ing)?\b/gi, 'use American spelling (-or)'],
  [
    /\b(organis|normalis|summaris|standardis|recognis|prioritis|minimis|optimis|customis|initialis|authoris|serialis)(e|es|ed|ing|ation|ations)\b/gi,
    'use American spelling (-ize)',
  ],
  [/\b(labell|cancell|modell|travell)(ed|ing)\b/gi, 'use American spelling (one l)'],
  [
    /\b(judgement|catalogue|centre|licence|defence|artefact|grey|programme)s?\b/gi,
    'use American spelling',
  ],
]
const OLD_PLACEHOLDERS = [
  [/<YYYY-MM-DD>/g, 'write the date token as YYYY-MM-DD, without brackets'],
  [/\(<date>\)/g, 'write the date token as (YYYY-MM-DD)'],
]

// Records and plans describe the past or the future, so the paths they mention may not exist:
// the changelog, decision records, and design docs. Their links are still checked.
export const isRecordOrPlan = (file) =>
  file === 'CHANGELOG.md' ||
  /^docs\/decisions\/\d{4}-/.test(file) ||
  (file.startsWith('docs/design/') && file !== 'docs/design/README.md')

// GitHub's heading anchors: strip formatting, lowercase, drop punctuation, spaces to hyphens.
export function slugify(heading) {
  return heading
    .replace(/<[^>]+>/g, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, '')
    .replace(/ /g, '-')
}

// The paths listed in the project's .dev-process.json, which dev_process checks upstream.
export function managedFiles(root) {
  const manifest = join(root, '.dev-process.json')
  if (!existsSync(manifest)) return new Set()
  return new Set(Object.keys(JSON.parse(readFileSync(manifest, 'utf8')).files ?? {}))
}

/**
 * Creates a linter for the repository at `root`.
 * - pathRoots: top-level folders whose mentions in prose (`docs/x.md`) must exist.
 * - properNouns, namedTerms: capitalized words and phrases allowed in sentence-case headings.
 * - scripts: npm scripts that `npm run <name>` may mention (omit to skip that check).
 * - skipPath(path): true for a mentioned path that need not exist.
 * - aliases: [prefix, dir] pairs; a mention that starts with prefix resolves under dir instead,
 *   such as ['~/.claude/dev_process/', <the clone>].
 */
export function createDocsLint({
  root,
  pathRoots = [],
  properNouns = [],
  namedTerms = [],
  scripts = null,
  skipPath = () => false,
  aliases = [],
}) {
  const problems = []
  const parsed = new Map()
  const nouns = new Set([...BASE_PROPER_NOUNS, ...properNouns])
  const terms = [...BASE_NAMED_TERMS, ...namedTerms]
  const roots = pathRoots.map((r) => r.replace(/\./g, '\\.')).join('|')
  const pathMention = roots
    ? new RegExp(`(?<![\\w./-])((?:${roots})/[\\w./-]*)(?:#([\\w-]+))?`, 'g')
    : null
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const aliasMentions = aliases.map(([prefix, dir]) => ({
    dir,
    pattern: new RegExp(`(?<![\\w./-])${escape(prefix)}([\\w./-]*)(?:#([\\w-]+))?`, 'g'),
  }))

  const posix = (p) => p.split(sep).join('/')
  const display = (abs) => posix(relative(process.cwd(), abs))
  const repoPath = (abs) => posix(relative(root, abs))
  const report = (abs, line, message) =>
    problems.push(`${display(abs)}${line ? `:${line}` : ''}  ${message}`)

  function walk(dir, keep, out = []) {
    if (!existsSync(dir)) return out
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full, keep, out)
      else if (keep(full)) out.push(full)
    }
    return out
  }

  // Splits a markdown file into lines tagged as fenced or not, and collects its heading anchors.
  function parseMarkdown(abs) {
    if (parsed.has(abs)) return parsed.get(abs)
    const lines = []
    const anchors = new Set()
    const seen = new Map()
    let fence = null
    readFileSync(abs, 'utf8')
      .split(/\r?\n/)
      .forEach((text, i) => {
        const marker = text.match(/^\s*(`{3,}|~{3,})/)
        if (marker) {
          if (fence === null) fence = marker[1][0]
          else if (marker[1][0] === fence) fence = null
          lines.push({ text, line: i + 1, fenced: true })
          return
        }
        const fenced = fence !== null
        if (!fenced) {
          const heading = text.match(/^#{1,6}\s+(.+?)\s*#*\s*$/)
          if (heading) {
            const base = slugify(heading[1])
            const count = seen.get(base) ?? 0
            seen.set(base, count + 1)
            anchors.add(count ? `${base}-${count}` : base)
          }
        }
        lines.push({ text, line: i + 1, fenced })
      })
    const doc = { lines, anchors }
    parsed.set(abs, doc)
    return doc
  }

  const plainLines = (abs) =>
    readFileSync(abs, 'utf8')
      .split(/\r?\n/)
      .map((text, i) => ({ text, line: i + 1, fenced: false }))

  function checkAnchor(abs, line, targetAbs, anchor, shown) {
    if (!anchor || !targetAbs.endsWith('.md') || !statSync(targetAbs).isFile()) return
    if (!parseMarkdown(targetAbs).anchors.has(anchor)) {
      report(abs, line, `no heading for ${shown} (#${anchor} in ${display(targetAbs)})`)
    }
  }

  // Relative links and their #anchors resolve.
  function checkLinks(abs) {
    for (const { text, line, fenced } of parseMarkdown(abs).lines) {
      if (fenced) continue
      const withoutCode = text.replace(/`[^`]*`/g, (span) => ' '.repeat(span.length))
      for (const match of withoutCode.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
        const target = match[1]
        if (/^(https?:|mailto:|tel:)/.test(target) || target.startsWith('<')) continue
        const [pathPart, anchor] = target.split('#')
        const targetAbs = pathPart ? resolve(dirname(abs), decodeURIComponent(pathPart)) : abs
        if (!existsSync(targetAbs)) report(abs, line, `broken link: ${target}`)
        else checkAnchor(abs, line, targetAbs, anchor, target)
      }
    }
  }

  // Repo paths and npm scripts mentioned in prose exist.
  function checkMentions(abs, lines) {
    if (isRecordOrPlan(repoPath(abs))) return
    for (const { text, line, fenced } of lines) {
      if (scripts) {
        for (const match of text.matchAll(/npm run ([\w:.-]+)/g)) {
          if (!(match[1] in scripts)) report(abs, line, `no npm script "${match[1]}"`)
        }
      }
      if (fenced || /^\s*>/.test(text)) continue
      const aliased = []
      for (const { dir, pattern } of aliasMentions) {
        for (const match of text.matchAll(pattern)) {
          aliased.push([match.index, match.index + match[0].length])
          const next = text[match.index + match[0].length] ?? ''
          const path = match[1].replace(/\.+$/, '')
          if ((next !== '' && '<*{$'.includes(next)) || /NNN|\.\.\./.test(path)) continue
          if (skipPath(match[0].replace(/\.+$/, '').replace(/#.*$/, ''))) continue
          const targetAbs = join(dir, path)
          if (!existsSync(targetAbs)) report(abs, line, `no such path: ${match[0]}`)
          else checkAnchor(abs, line, targetAbs, match[2], match[0])
        }
      }
      if (!pathMention) continue
      for (const match of text.matchAll(pathMention)) {
        if (aliased.some(([s, e]) => match.index >= s && match.index < e)) continue
        const next = text[match.index + match[0].length] ?? ''
        const path = match[1].replace(/\.+$/, '')
        if (next !== '' && '<*{$'.includes(next)) continue // a placeholder or glob follows
        if (/NNN|\.\.\./.test(path) || skipPath(path)) continue
        const targetAbs = join(root, path)
        if (!existsSync(targetAbs)) report(abs, line, `no such path: ${path}`)
        else checkAnchor(abs, line, targetAbs, match[2], `${path}#${match[2]}`)
      }
    }
  }

  function headingCaseProblem(heading) {
    let text = heading
      .replace(/<!--.*?-->/g, '')
      .replace(/`[^`]*`/g, '')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '')
      .replace(/\*\*[^*]+\*\*/g, '')
      .replace(/<[^>]*>/g, '')
      .replace(/^\[[^\]]*\]/, '')
      .replace(/^\d+(\.\d+)*\.?\s+/, '')
    for (const term of terms) text = text.split(term).join(' ')
    const words = text.split(/[\s/(),:;|–—-]+/).filter(Boolean)
    const offender = words
      .slice(1)
      .find((w) => /^[A-Z][a-z]/.test(w) && !nouns.has(w.replace(/[^\w]/g, '')))
    return offender ? `heading isn't sentence case ("${offender}"): ${heading}` : null
  }

  // Sentence-case headings, American spelling, and current placeholders.
  function checkStyle(abs, lines) {
    for (const { text, line, fenced } of lines) {
      if (fenced) continue
      const heading = text.match(/^#{1,6}\s+(.+?)\s*#*\s*$/)
      if (heading && abs.endsWith('.md')) {
        const problem = headingCaseProblem(heading[1])
        if (problem) report(abs, line, problem)
      }
      const prose = text.replace(/`[^`]*`/g, '').replace(/https?:\/\/\S+/g, '')
      for (const [pattern, advice] of [...BRITISH, ...OLD_PLACEHOLDERS]) {
        for (const match of prose.matchAll(pattern)) report(abs, line, `"${match[0]}": ${advice}`)
      }
    }
  }

  // An index links to every matching file in its folder.
  function checkIndex(dir, index, entryPattern, linkPrefix = '') {
    const dirAbs = join(root, dir)
    const indexAbs = join(root, index)
    if (!existsSync(dirAbs)) return
    const text = existsSync(indexAbs) ? readFileSync(indexAbs, 'utf8') : ''
    for (const name of readdirSync(dirAbs)) {
      if (name === 'README.md' || !entryPattern.test(name)) continue
      if (!text.includes(`(${linkPrefix}${name}`)) {
        report(indexAbs, 0, `doesn't link to ${posix(join(dir, name))}`)
      }
    }
  }

  function checkMarkdown(abs, { links = true, mentions = true, style = true } = {}) {
    const { lines } = parseMarkdown(abs)
    if (links) checkLinks(abs)
    if (mentions) checkMentions(abs, lines)
    if (style) checkStyle(abs, lines)
  }

  function checkYaml(abs, { mentions = true, style = true } = {}) {
    const lines = plainLines(abs)
    if (mentions) checkMentions(abs, lines)
    if (style) checkStyle(abs, lines)
  }

  // Prints the problems and returns the exit code.
  function finish(name, summary) {
    if (problems.length) {
      console.error(`${name}: ${problems.length} problem(s)\n`)
      for (const problem of problems) console.error(`  ${problem}`)
      console.error('\nSee standards/documentation.md#automated-checks in dev_process.')
      return 1
    }
    console.log(`${name}: ${summary}`)
    return 0
  }

  return {
    problems,
    report,
    walk,
    repoPath,
    parseMarkdown,
    plainLines,
    checkLinks,
    checkMentions,
    checkStyle,
    checkMarkdown,
    checkYaml,
    checkIndex,
    headingCaseProblem,
    finish,
  }
}
