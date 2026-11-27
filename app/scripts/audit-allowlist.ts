// What the dependency audit gate decides (`npm run check:audit`). check-audit.ts runs
// `npm audit --omit=dev --json` and prints what `runGate` returns, so the unit test can drive
// every decision from recorded reports.
//
// After finance-stack's app/scripts/audit-allowlist-core.ts, with one gate instead of two:
// Synapse audits only the `npm audit --omit=dev` tree (docs/PROCESS.md, Upgrades, says what that
// covers), so an entry has no `runtime` marker. The rules:
//
// - A HIGH or CRITICAL advisory fails the gate, as `npm audit --audit-level=high` would, unless
//   app/.audit-allowlist has an entry for it.
// - An entry is an advisory, not a package. npm also flags each package that only depends on a
//   vulnerable one, naming that dependency in `via` as a string. Those aren't advisories of
//   their own, so one entry covers its advisory wherever npm reports it.
// - An entry stops working on its expiry date: `exp:2026-12-01` allows through 2026-11-30.
// - An entry that matches no HIGH or CRITICAL advisory is stale: a warning, never a failure.
// - Whatever it can't read fails the gate: a report in a shape it doesn't know, an advisory with
//   no id or an unknown severity, or an allowlist line that isn't an entry. An audit it couldn't
//   read must never look like a clean tree.

/** The allowlist, as messages name it from the repository root. */
const ALLOWLIST = "app/.audit-allowlist";

const SEVERITIES = ["info", "low", "moderate", "high", "critical"];
const BLOCKING = new Set(["high", "critical"]);

// The advisory's GHSA id, or npm's numeric id in its place, then the expiry date. Positional
// groups, because tsconfig.json targets ES2017, which has no named ones.
const ENTRY = /^(GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}|\d+)\s+exp:(\d{4}-\d{2}-\d{2})$/;
const GHSA_URL = /\/(GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4})$/;

interface Entry {
  id: string;
  /** `YYYY-MM-DD`: the first day the entry no longer allows its advisory. */
  expires: string;
  /** 1-indexed, for messages. */
  line: number;
}

interface Advisory {
  /** The GHSA id from the advisory's url, or npm's id when it has none. */
  id: string;
  /** npm's ids for it: npm lists one advisory once per package and affected range. */
  npmIds: string[];
  /** The highest severity npm gives it, as npm itself reports it. */
  severity: string;
  /** The packages it's filed against. */
  packages: string[];
  title: string;
  url: string;
}

export interface GateInput {
  /** What `npm audit --omit=dev --json` printed on stdout. */
  auditOutput: string;
  /** The text of app/.audit-allowlist. */
  allowlist: string;
  /** Today, as `YYYY-MM-DD` in UTC. */
  today: string;
}

export interface GateReport {
  /** True when nothing fails the gate. */
  ok: boolean;
  /** Each reason the gate fails. */
  errors: string[];
  /** Each entry that allows nothing. Warnings never fail the gate. */
  warnings: string[];
  /** Each advisory an entry allows. */
  notes: string[];
  /** How the gate came out, in one line. */
  summary: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function isRealDate(value: string): boolean {
  // `new Date("2026-02-31")` rolls over to March rather than failing, so compare the round trip.
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** The entries, and an error for each line that isn't one. Comments and blank lines are skipped. */
function parseAllowlist(text: string): { entries: Entry[]; errors: string[] } {
  const entries: Entry[] = [];
  const errors: string[] = [];
  const firstLine = new Map<string, number>();

  text.split("\n").forEach((raw, index) => {
    const line = index + 1;
    const content = raw.trim();
    if (content === "" || content.startsWith("#")) return;

    const match = ENTRY.exec(content);
    if (!match) {
      errors.push(
        `${ALLOWLIST}:${line}: "${content}" isn't an entry. Each entry is ` +
          "`GHSA-xxxx-xxxx-xxxx exp:YYYY-MM-DD`, with why it's allowed and what lifts it in `#` " +
          "comments beneath it.",
      );
      return;
    }

    const [, id, expires] = match;
    if (!isRealDate(expires)) {
      errors.push(`${ALLOWLIST}:${line}: ${id} has exp:${expires}, which isn't a date.`);
      return;
    }

    const first = firstLine.get(id);
    if (first !== undefined) {
      errors.push(
        `${ALLOWLIST}:${line}: ${id} is already listed on line ${first}. Keep one entry per ` +
          "advisory, so it has one date and one reason.",
      );
      return;
    }

    firstLine.set(id, line);
    entries.push({ id, expires, line });
  });

  return { entries, errors };
}

/** The advisories in npm's report, or why it can't be read. */
function readReport(auditOutput: string): { advisories: Advisory[] } | { unreadable: string } {
  if (auditOutput.trim() === "") return { unreadable: "npm audit printed nothing" };

  let report: unknown;
  try {
    report = JSON.parse(auditOutput);
  } catch {
    return { unreadable: "npm audit's output isn't JSON" };
  }
  if (!isRecord(report)) return { unreadable: "the report isn't a JSON object" };

  const { vulnerabilities } = report;
  if (!isRecord(vulnerabilities)) {
    // When the audit itself fails, npm prints an error in place of a report: `message` when the
    // registry fails (as with no network), `error.summary` when npm does (as with no lockfile).
    const { message, error } = report;
    const summary = isRecord(error) ? error.summary : undefined;
    const npmSaid = [message, summary].find((text) => typeof text === "string" && text !== "");
    const said = npmSaid === undefined ? "" : ` (npm said: ${String(npmSaid)})`;
    return { unreadable: `it has no \`vulnerabilities\` object${said}` };
  }

  const byId = new Map<string, Advisory>();
  for (const [name, vulnerability] of Object.entries(vulnerabilities)) {
    if (!isRecord(vulnerability) || !Array.isArray(vulnerability.via)) {
      return { unreadable: `${name} has no \`via\` list` };
    }

    for (const via of vulnerability.via) {
      // A string names the vulnerable package this one depends on: not an advisory of its own.
      if (typeof via === "string") continue;
      if (!isRecord(via)) return { unreadable: `${name} has a \`via\` item it can't read` };

      const npmId =
        typeof via.source === "number" || typeof via.source === "string"
          ? String(via.source)
          : undefined;
      const url = typeof via.url === "string" ? via.url.trim() : "";
      const id = GHSA_URL.exec(url)?.[1] ?? npmId;
      if (id === undefined) {
        return { unreadable: `an advisory against ${name} has neither a GHSA url nor an npm id` };
      }
      if (typeof via.severity !== "string" || !SEVERITIES.includes(via.severity)) {
        return {
          unreadable: `${id} has the severity "${String(via.severity)}", which npm doesn't use`,
        };
      }

      const packageName = typeof via.name === "string" ? via.name : name;
      const known = byId.get(id);
      if (known) {
        if (npmId !== undefined && !known.npmIds.includes(npmId)) known.npmIds.push(npmId);
        if (!known.packages.includes(packageName)) known.packages.push(packageName);
        // npm's advisory cache can keep an old severity for one npm id while the registry has
        // re-scored the advisory, so take the highest, as npm itself does.
        if (SEVERITIES.indexOf(via.severity) > SEVERITIES.indexOf(known.severity)) {
          known.severity = via.severity;
        }
        continue;
      }
      byId.set(id, {
        id,
        npmIds: npmId === undefined ? [] : [npmId],
        severity: via.severity,
        packages: [packageName],
        title: typeof via.title === "string" ? via.title : "(no title)",
        url,
      });
    }
  }

  // Packages flagged with no advisory behind any of them means the report's shape has changed.
  if (byId.size === 0 && Object.keys(vulnerabilities).length > 0) {
    return { unreadable: "it flags packages but names no advisory" };
  }

  return { advisories: [...byId.values()] };
}

const describe = ({ severity, id, packages, title }: Advisory) =>
  `${severity.toUpperCase()} ${id} in ${packages.join(", ")}: ${title}`;

const at = (entry: Entry) => `${ALLOWLIST}:${entry.line}`;

/** Decides the gate: each HIGH or CRITICAL advisory in the report against the allowlist. */
export function runGate({ auditOutput, allowlist, today }: GateInput): GateReport {
  const { entries, errors } = parseAllowlist(allowlist);
  const warnings: string[] = [];
  const notes: string[] = [];
  let unallowed = 0;

  const read = readReport(auditOutput);
  if ("unreadable" in read) {
    errors.push(
      `The audit report can't be read: ${read.unreadable}. The gate fails rather than pass a ` +
        "tree it couldn't check. Run `npm audit --omit=dev --json` in app/ to see what npm " +
        "printed.",
    );
  } else {
    const used = new Set<Entry>();

    for (const advisory of read.advisories) {
      if (!BLOCKING.has(advisory.severity)) continue;

      const matches = entries.filter(
        (entry) => entry.id === advisory.id || advisory.npmIds.includes(entry.id),
      );
      for (const entry of matches) used.add(entry);
      const [entry] = matches;

      if (matches.length > 1) {
        errors.push(
          `${describe(advisory)}. It has an entry at each of ${matches.map(at).join(" and ")}: ` +
            "keep one, so it has one date and one reason.",
        );
      } else if (!entry) {
        const link = advisory.url === "" ? "" : ` ${advisory.url}`;
        errors.push(`${describe(advisory)}. It has no entry in ${ALLOWLIST}.${link}`);
        unallowed += 1;
      } else if (entry.expires <= today) {
        errors.push(
          `${describe(advisory)}. Its entry at ${at(entry)} expired on ${entry.expires}. If a ` +
            "fixed version can be reached now, take it and delete the entry; if not, set a new " +
            "date and say in its comment what changed.",
        );
      } else {
        notes.push(
          `Allowed: ${describe(advisory)}, by ${at(entry)}, which expires on ${entry.expires}.`,
        );
      }
    }

    for (const entry of entries) {
      if (used.has(entry)) continue;
      warnings.push(
        `${at(entry)}: ${entry.id} matches no HIGH or CRITICAL advisory in the runtime tree, so ` +
          "it allows nothing. Delete it and its comment.",
      );
    }
  }

  const ok = errors.length === 0;
  const allowed = notes.length > 0 ? `, apart from ${notes.length} allowed by ${ALLOWLIST}` : "";
  const fix =
    unallowed > 0
      ? " Fix an advisory with no entry by upgrading the package, then with an `overrides` " +
        "entry, and only when no fixed version can be reached, with a dated entry in " +
        `${ALLOWLIST} (docs/PROCESS.md, Upgrades).`
      : "";
  const summary = ok
    ? `✓ Dependency audit (runtime): no HIGH or CRITICAL advisories${allowed}.`
    : `✗ Dependency audit (runtime) failed.${fix}`;

  return { ok, errors, warnings, notes, summary };
}
