// The dependency audit gate (`npm run check:audit`, AC8), driven by recorded `npm audit --json`
// output. Each fixture is what npm 11.20.0 printed on 2026-11-26, formatted by Prettier:
//
// - npm-audit-clean.json: `npm audit --omit=dev --json` in app/ on main, which found nothing.
// - npm-audit-advisories.json: `npm audit --json` in a scratch project whose dependencies were
//   esbuild 0.24.2, minimist 1.2.5, mkdirp 0.5.1, and postcss 8.5.23, with nanoid overridden to
//   3.3.16, resolved by `npm install --package-lock-only --ignore-scripts`. It has a CRITICAL
//   advisory listed twice under two npm ids, a HIGH one, two MODERATE ones, and two packages
//   flagged only because they depend on a vulnerable one (mkdirp on minimist, postcss on nanoid).
// - npm-audit-offline.json: the same command with `--registry=http://127.0.0.1:9/`, which is what
//   npm prints when it can't reach the registry.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runGate, type GateReport } from "@/scripts/audit-allowlist";

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, "fixtures", `npm-audit-${name}.json`), "utf8");

const CLEAN = fixture("clean");
const ADVISORIES = fixture("advisories");
const OFFLINE = fixture("offline");

const CRITICAL = "GHSA-xvch-5gv4-984h"; // minimist, and mkdirp through it
const HIGH = "GHSA-2v37-7h3g-55p8"; // nanoid, and postcss through it
const MODERATE = "GHSA-67mh-4wv8-2f99"; // esbuild

const TODAY = "2026-11-26";

/** An allowlist as the file reads: a header, then each entry with the reason beneath it. */
const allowlist = (...entries: string[]) =>
  [
    "# Per-advisory exceptions to the runtime dependency audit.",
    "",
    ...entries.flatMap((entry) => [entry, "# Why it's allowed, and what lifts it.", ""]),
  ].join("\n");

/** The 1-indexed line of the nth entry (0-based) in an `allowlist(...)`. */
const entryLine = (n: number) => 3 + 3 * n;

const errorsAbout = (report: GateReport, text: string) =>
  report.errors.filter((error) => error.includes(text));

describe("the audit gate", () => {
  it("passes the clean report from main", () => {
    const report = runGate({ auditOutput: CLEAN, allowlist: allowlist(), today: TODAY });

    expect(report.ok).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
  });

  it("fails on each HIGH or CRITICAL advisory with no entry, naming its id, package, and severity", () => {
    const report = runGate({ auditOutput: ADVISORIES, allowlist: allowlist(), today: TODAY });

    expect(report.ok).toBe(false);

    const [critical] = errorsAbout(report, CRITICAL);
    expect(critical).toContain("CRITICAL");
    expect(critical).toContain("minimist");

    const [high] = errorsAbout(report, HIGH);
    expect(high).toContain("HIGH");
    expect(high).toContain("nanoid");
  });

  it("counts an advisory once, however many npm ids and flagged packages it has", () => {
    const report = runGate({ auditOutput: ADVISORIES, allowlist: allowlist(), today: TODAY });

    // npm lists the CRITICAL advisory twice, under two ids, and flags mkdirp and postcss only
    // because they depend on minimist and nanoid. None of that is an advisory of its own.
    expect(errorsAbout(report, CRITICAL)).toHaveLength(1);
    expect(errorsAbout(report, HIGH)).toHaveLength(1);
    expect(errorsAbout(report, "mkdirp")).toEqual([]);
    expect(errorsAbout(report, "postcss")).toEqual([]);
  });

  it("passes when every HIGH and CRITICAL advisory has an entry, leaving MODERATE ones alone", () => {
    const report = runGate({
      auditOutput: ADVISORIES,
      allowlist: allowlist(`${CRITICAL} exp:2026-12-01`, `${HIGH} exp:2026-12-01`),
      today: TODAY,
    });

    // The report still has two MODERATE advisories, and mkdirp and postcss flagged CRITICAL and
    // HIGH through their dependencies, and none of them blocks.
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("lists each allowed advisory with its entry", () => {
    const report = runGate({
      auditOutput: ADVISORIES,
      allowlist: allowlist(`${CRITICAL} exp:2026-12-01`, `${HIGH} exp:2026-12-15`),
      today: TODAY,
    });

    const [high] = report.notes.filter((note) => note.includes(HIGH));
    expect(high).toContain(`app/.audit-allowlist:${entryLine(1)}`);
    expect(high).toContain("2026-12-15");
  });

  it("honours an entry through the day before its expiry date", () => {
    const report = runGate({
      auditOutput: ADVISORIES,
      allowlist: allowlist(`${CRITICAL} exp:2026-12-01`, `${HIGH} exp:2026-12-01`),
      today: "2026-11-30",
    });

    expect(report.ok).toBe(true);
  });

  it("stops honouring an entry on its expiry date, naming the entry's line and date", () => {
    const report = runGate({
      auditOutput: ADVISORIES,
      allowlist: allowlist(`${CRITICAL} exp:2027-06-01`, `${HIGH} exp:2026-12-01`),
      today: "2026-12-01",
    });

    expect(report.ok).toBe(false);
    expect(errorsAbout(report, CRITICAL)).toEqual([]);

    const [expired] = errorsAbout(report, HIGH);
    expect(expired).toContain(`app/.audit-allowlist:${entryLine(1)}`);
    expect(expired).toContain("2026-12-01");
  });

  it("matches an entry written with npm's numeric id", () => {
    // 1139427 is the HIGH advisory's npm id, and 1097678 is the second of the CRITICAL one's.
    const report = runGate({
      auditOutput: ADVISORIES,
      allowlist: allowlist("1097678 exp:2026-12-01", "1139427 exp:2026-12-01"),
      today: TODAY,
    });

    expect(report.ok).toBe(true);
  });

  it("warns about, but passes, an entry that allows nothing", () => {
    const stale = runGate({
      auditOutput: CLEAN,
      allowlist: allowlist(`${HIGH} exp:2026-12-01`),
      today: TODAY,
    });

    expect(stale.ok).toBe(true);
    expect(stale.warnings).toHaveLength(1);
    expect(stale.warnings[0]).toContain(HIGH);
    expect(stale.warnings[0]).toContain(`app/.audit-allowlist:${entryLine(0)}`);

    // A MODERATE advisory never blocks, so an entry for one allows nothing either, and an
    // expired entry that matches nothing is only stale.
    const moderate = runGate({
      auditOutput: ADVISORIES,
      allowlist: allowlist(
        `${CRITICAL} exp:2026-12-01`,
        `${HIGH} exp:2026-12-01`,
        `${MODERATE} exp:2026-12-01`,
      ),
      today: TODAY,
    });
    expect(moderate.ok).toBe(true);
    expect(moderate.warnings).toHaveLength(1);
    expect(moderate.warnings[0]).toContain(MODERATE);

    const expired = runGate({
      auditOutput: CLEAN,
      allowlist: allowlist(`${HIGH} exp:2026-11-01`),
      today: TODAY,
    });
    expect(expired.ok).toBe(true);
    expect(expired.warnings).toHaveLength(1);
  });

  it("reads the committed allowlist without errors", () => {
    const committed = readFileSync(join(import.meta.dirname, "../../../.audit-allowlist"), "utf8");

    const report = runGate({ auditOutput: CLEAN, allowlist: committed, today: TODAY });

    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
  });
});

describe("the audit gate fails closed", () => {
  const blocked = (auditOutput: string, list = allowlist()) =>
    runGate({ auditOutput, allowlist: list, today: TODAY });

  it("on the report npm prints when it can't reach the registry, quoting npm", () => {
    const report = blocked(OFFLINE);

    expect(report.ok).toBe(false);
    expect(report.errors.join("\n")).toContain("ECONNREFUSED");
  });

  it.each([
    ["empty output", ""],
    ["output that isn't JSON", "npm error code ENOLOCK\n"],
    ["a report with no vulnerabilities object", JSON.stringify({ auditReportVersion: 2 })],
    [
      "a package with no via",
      JSON.stringify({ vulnerabilities: { nanoid: { name: "nanoid", severity: "high" } } }),
    ],
    [
      "flagged packages but no advisory",
      JSON.stringify({ vulnerabilities: { postcss: { name: "postcss", via: ["nanoid"] } } }),
    ],
  ])("on %s", (_, auditOutput) => {
    const report = blocked(auditOutput);

    expect(report.ok).toBe(false);
    expect(report.errors).not.toEqual([]);
  });

  /** The recorded report, with the HIGH advisory changed by `change`. */
  const withHighAdvisory = (change: (advisory: Record<string, unknown>) => void) => {
    const report = JSON.parse(ADVISORIES);
    change(report.vulnerabilities.nanoid.via[0]);
    return JSON.stringify(report);
  };

  it("on an advisory with a severity it doesn't know", () => {
    const report = blocked(
      withHighAdvisory((advisory) => {
        advisory.severity = "severe";
      }),
    );

    expect(report.ok).toBe(false);
    expect(report.errors.join("\n")).toContain("severe");
  });

  it("on an advisory with neither a GHSA url nor an npm id", () => {
    const report = blocked(
      withHighAdvisory((advisory) => {
        delete advisory.url;
        delete advisory.source;
      }),
    );

    expect(report.ok).toBe(false);
  });

  it.each([
    ["no exp:", `${HIGH} 2026-12-01`],
    ["a trailing word", `${HIGH} exp:2026-12-01 runtime`],
    ["an id that isn't a GHSA or npm id", "CVE-2026-12345 exp:2026-12-01"],
    ["a date that doesn't exist", `${HIGH} exp:2026-02-31`],
  ])("on an allowlist entry with %s, naming its line", (_, entry) => {
    const report = blocked(ADVISORIES, allowlist(`${CRITICAL} exp:2026-12-01`, entry));

    expect(report.ok).toBe(false);
    expect(report.errors.join("\n")).toContain(`app/.audit-allowlist:${entryLine(1)}`);
  });

  it("on an advisory listed twice, naming both lines", () => {
    const report = blocked(
      ADVISORIES,
      allowlist(`${CRITICAL} exp:2026-12-01`, `${HIGH} exp:2026-12-01`, `${HIGH} exp:2027-01-01`),
    );

    expect(report.ok).toBe(false);
    const [duplicate] = report.errors.filter((error) => error.includes("listed"));
    expect(duplicate).toContain(`app/.audit-allowlist:${entryLine(2)}`);
    expect(duplicate).toContain(`line ${entryLine(1)}`);
  });
});
