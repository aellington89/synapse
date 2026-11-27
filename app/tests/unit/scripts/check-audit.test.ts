// The dependency audit gate (`npm run check:audit`, AC8), driven by recorded `npm audit --json`
// output. Each fixture is what npm 11.20.0 printed on 2026-11-26 or 2026-11-27, formatted by
// Prettier:
//
// - npm-audit-clean.json: `npm audit --omit=dev --json` in app/ on main, which found nothing.
// - npm-audit-advisories.json: `npm audit --json` in a scratch project whose dependencies were
//   esbuild 0.24.2, minimist 1.2.5, mkdirp 0.5.1, and postcss 8.5.23, with nanoid overridden to
//   3.3.16, resolved by `npm install --package-lock-only --ignore-scripts`. It has a CRITICAL
//   advisory listed twice under two npm ids, a HIGH one, two MODERATE ones, and two packages
//   flagged only because they depend on a vulnerable one (mkdirp on minimist, postcss on nanoid).
// - npm-audit-two-packages.json: the same, for @babel/traverse 7.23.0 and babel-traverse 6.26.0.
//   One CRITICAL advisory is filed against both packages, under two npm ids.
// - npm-audit-offline.json: the advisories project with `--registry=http://127.0.0.1:9/`, which is
//   what npm prints when it can't reach the registry.
// - npm-audit-no-lockfile.json: `npm audit --omit=dev --json` in a project with no lockfile.

import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runGate, type GateReport } from "@/scripts/audit-allowlist";

const APP = join(import.meta.dirname, "../../..");

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, "fixtures", `npm-audit-${name}.json`), "utf8");

const CLEAN = fixture("clean");
const ADVISORIES = fixture("advisories");
const TWO_PACKAGES = fixture("two-packages");
const OFFLINE = fixture("offline");
const NO_LOCKFILE = fixture("no-lockfile");

const CRITICAL = "GHSA-xvch-5gv4-984h"; // minimist, and mkdirp through it
const HIGH = "GHSA-2v37-7h3g-55p8"; // nanoid, and postcss through it
const MODERATE = "GHSA-67mh-4wv8-2f99"; // esbuild
const BABEL = "GHSA-67hx-6x53-jw92"; // @babel/traverse and babel-traverse

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

type Report = { vulnerabilities: Record<string, { via: Record<string, unknown>[] }> };

/** A recorded report, changed by `change` first. */
const changed = (report: string, change: (report: Report) => void) => {
  const parsed = JSON.parse(report) as Report;
  change(parsed);
  return JSON.stringify(parsed);
};

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

    // Each title names its package too, so look for the package where the message puts it.
    const [critical] = errorsAbout(report, CRITICAL);
    expect(critical).toContain(`CRITICAL ${CRITICAL} in minimist: `);

    const [high] = errorsAbout(report, HIGH);
    expect(high).toContain(`HIGH ${HIGH} in nanoid: `);

    // The summary says how to fix one: upgrade, then override, then allow.
    expect(report.summary).toContain("`overrides`");
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

  it("names every package an advisory is filed against, and one entry allows them all", () => {
    const unallowed = runGate({ auditOutput: TWO_PACKAGES, allowlist: allowlist(), today: TODAY });

    expect(unallowed.errors).toHaveLength(1);
    expect(unallowed.errors[0]).toContain(`CRITICAL ${BABEL} in @babel/traverse, babel-traverse: `);

    const allowed = runGate({
      auditOutput: TWO_PACKAGES,
      allowlist: allowlist(`${BABEL} exp:2026-12-01`),
      today: TODAY,
    });
    expect(allowed.ok).toBe(true);
  });

  it("takes an advisory's highest severity when npm's records of it disagree", () => {
    // npm's advisory cache can keep an old severity for one of an advisory's npm ids. npm reports
    // the highest, and so must the gate.
    const stale = changed(ADVISORIES, (report) => {
      report.vulnerabilities.minimist.via[1].severity = "moderate";
    });

    const report = runGate({
      auditOutput: stale,
      allowlist: allowlist(`${HIGH} exp:2026-12-01`),
      today: TODAY,
    });

    expect(report.ok).toBe(false);
    expect(errorsAbout(report, CRITICAL)[0]).toContain(`CRITICAL ${CRITICAL}`);
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

  it("honors an entry through the day before its expiry date", () => {
    const report = runGate({
      auditOutput: ADVISORIES,
      allowlist: allowlist(`${CRITICAL} exp:2026-12-01`, `${HIGH} exp:2026-12-01`),
      today: "2026-11-30",
    });

    expect(report.ok).toBe(true);
  });

  it("stops honoring an entry on its expiry date, naming the entry's line and date", () => {
    const onTheDate = runGate({
      auditOutput: ADVISORIES,
      allowlist: allowlist(`${CRITICAL} exp:2027-06-01`, `${HIGH} exp:2026-12-01`),
      today: "2026-12-01",
    });
    expect(onTheDate.ok).toBe(false);

    const weekLater = runGate({
      auditOutput: ADVISORIES,
      allowlist: allowlist(`${CRITICAL} exp:2027-06-01`, `${HIGH} exp:2026-12-01`),
      today: "2026-12-08",
    });

    expect(weekLater.ok).toBe(false);
    expect(errorsAbout(weekLater, CRITICAL)).toEqual([]);

    const [expired] = errorsAbout(weekLater, HIGH);
    expect(expired).toContain(`app/.audit-allowlist:${entryLine(1)}`);
    expect(expired).toContain("expired on 2026-12-01");
    expect(expired).not.toContain("2026-12-08");
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

  it("knows an advisory with no GHSA url by its npm id and package", () => {
    const noUrl = JSON.stringify({
      vulnerabilities: {
        mystery: { name: "mystery", via: [{ source: 999, severity: "critical" }] },
      },
    });

    const unallowed = runGate({ auditOutput: noUrl, allowlist: allowlist(), today: TODAY });
    expect(unallowed.errors[0]).toContain("CRITICAL 999 in mystery: ");

    const allowed = runGate({
      auditOutput: noUrl,
      allowlist: allowlist("999 exp:2026-12-01"),
      today: TODAY,
    });
    expect(allowed.ok).toBe(true);
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
    const committed = readFileSync(join(APP, ".audit-allowlist"), "utf8");

    const report = runGate({ auditOutput: CLEAN, allowlist: committed, today: TODAY });

    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
  });
});

describe("the audit gate fails closed", () => {
  const blocked = (auditOutput: string, list = allowlist()) =>
    runGate({ auditOutput, allowlist: list, today: TODAY });

  // The CRITICAL advisory allowed, so that only the thing under test can fail the gate.
  const criticalAllowed = allowlist(`${CRITICAL} exp:2026-12-01`);

  it.each([
    ["it can't reach the registry", OFFLINE, "ECONNREFUSED"],
    ["there's no lockfile", NO_LOCKFILE, "This command requires an existing lockfile."],
  ])("on the error npm prints when %s, quoting npm", (_, auditOutput, quote) => {
    const report = blocked(auditOutput);

    expect(report.ok).toBe(false);
    expect(report.errors.join("\n")).toContain(quote);
    // With no advisory to fix, it doesn't say how to fix one.
    expect(report.summary).not.toContain("`overrides`");
  });

  // A MODERATE advisory beside each broken package, so the report always names an advisory and
  // only the broken package can make it unreadable.
  const esbuild = JSON.parse(ADVISORIES).vulnerabilities.esbuild;

  it.each([
    ["empty output", "", "printed nothing"],
    ["output that isn't JSON", "npm error code ENOLOCK\n", "isn't JSON"],
    ["no vulnerabilities object", JSON.stringify({ auditReportVersion: 2 }), "`vulnerabilities`"],
    [
      "a package with no via",
      JSON.stringify({
        vulnerabilities: { esbuild, nanoid: { name: "nanoid", severity: "high" } },
      }),
      "nanoid has no `via` list",
    ],
    [
      "a via item that's neither a package nor an advisory",
      JSON.stringify({ vulnerabilities: { esbuild, nanoid: { name: "nanoid", via: [1139427] } } }),
      "nanoid has a `via` item it can't read",
    ],
    [
      "flagged packages but no advisory",
      JSON.stringify({ vulnerabilities: { postcss: { name: "postcss", via: ["nanoid"] } } }),
      "names no advisory",
    ],
  ])("on %s", (_, auditOutput, reason) => {
    const report = blocked(auditOutput);

    expect(report.ok).toBe(false);
    expect(report.errors.join("\n")).toContain(reason);
  });

  it("on an advisory with a severity it doesn't know", () => {
    const report = blocked(
      changed(ADVISORIES, (report) => {
        report.vulnerabilities.nanoid.via[0].severity = "severe";
      }),
      criticalAllowed,
    );

    expect(report.ok).toBe(false);
    expect(report.errors.join("\n")).toContain('"severe"');
  });

  it("on an advisory with neither a GHSA url nor an npm id", () => {
    const report = blocked(
      changed(ADVISORIES, (report) => {
        delete report.vulnerabilities.nanoid.via[0].url;
        delete report.vulnerabilities.nanoid.via[0].source;
      }),
      criticalAllowed,
    );

    expect(report.ok).toBe(false);
    expect(report.errors.join("\n")).toContain("neither a GHSA url nor an npm id");
  });

  it.each([
    ["no exp:", `${HIGH} 2026-12-01`],
    ["a trailing word", `${HIGH} exp:2026-12-01 runtime`],
    ["an id that isn't a GHSA or npm id", "CVE-2026-12345 exp:2026-12-01"],
    // February 31 never exists, and this one is after TODAY, so it can't pass as expired.
    ["a date that doesn't exist", `${HIGH} exp:2027-02-31`],
  ])("on an allowlist entry with %s, naming its line", (_, entry) => {
    const report = blocked(ADVISORIES, allowlist(`${CRITICAL} exp:2026-12-01`, entry));

    expect(report.ok).toBe(false);
    const line = `app/.audit-allowlist:${entryLine(1)}: `;
    expect(report.errors.filter((error) => error.startsWith(line))).toHaveLength(1);
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

  it("on an advisory listed under both its GHSA id and its npm id, naming both lines", () => {
    const report = blocked(
      ADVISORIES,
      allowlist(`${CRITICAL} exp:2026-12-01`, `${HIGH} exp:2026-12-01`, "1139427 exp:2027-01-01"),
    );

    expect(report.ok).toBe(false);
    const [twice] = errorsAbout(report, HIGH);
    expect(twice).toContain(`app/.audit-allowlist:${entryLine(1)}`);
    expect(twice).toContain(`app/.audit-allowlist:${entryLine(2)}`);
  });
});

// The script itself, run as `npm run check:audit` runs it, against a fake `npm` first on PATH that
// records its arguments and prints a recorded report. It reads the committed allowlist.
describe("check-audit.ts", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "check-audit-test-"));
    writeFileSync(
      join(dir, "npm"),
      '#!/bin/sh\nprintf "%s\\n" "$@" > "$FAKE_NPM_ARGS"\ncat "$FAKE_NPM_REPORT"\nexit "$FAKE_NPM_STATUS"\n',
    );
    chmodSync(join(dir, "npm"), 0o755);
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const run = (
    report: string,
    npmStatus: number,
    path = `${dir}${delimiter}${process.env.PATH}`,
  ) => {
    const reportFile = join(dir, "report.json");
    const argsFile = join(dir, "args");
    writeFileSync(reportFile, report);
    rmSync(argsFile, { force: true });

    const result = spawnSync(
      process.execPath,
      [join(APP, "node_modules/tsx/dist/cli.mjs"), "scripts/check-audit.ts"],
      {
        cwd: APP,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: path,
          FAKE_NPM_ARGS: argsFile,
          FAKE_NPM_REPORT: reportFile,
          FAKE_NPM_STATUS: String(npmStatus),
        },
      },
    );
    const args = existsSync(argsFile) ? readFileSync(argsFile, "utf8").trim().split("\n") : [];
    return { status: result.status, stdout: result.stdout, args };
  };

  it("exits 1 with an error annotation for each advisory with no entry", () => {
    // npm exits 1 whenever it finds an advisory, with the report on stdout.
    const { status, stdout } = run(ADVISORIES, 1);

    expect(status).toBe(1);
    expect(stdout).toMatch(new RegExp(`^::error::CRITICAL ${CRITICAL} in minimist: `, "m"));
    expect(stdout).toMatch(new RegExp(`^::error::HIGH ${HIGH} in nanoid: `, "m"));
  });

  it("exits 0 on a clean report", () => {
    const { status, stdout } = run(CLEAN, 0);

    expect(status).toBe(0);
    expect(stdout).toContain("✓ Dependency audit (runtime)");
  });

  it("audits the runtime tree with npm's config pinned and a cache of its own", () => {
    const { args } = run(CLEAN, 0);

    expect(args.slice(0, 2)).toEqual(["audit", "--omit=dev"]);
    expect(args).toEqual(
      expect.arrayContaining(["--include=optional", "--include=peer", "--offline=false", "--json"]),
    );

    // A fresh cache for each run, removed afterwards.
    const cache = args.find((arg) => arg.startsWith("--cache="))?.slice("--cache=".length);
    expect(cache).toContain(tmpdir());
    expect(existsSync(cache ?? "")).toBe(false);
  });

  it("escapes what it prints in annotations", () => {
    const { stdout } = run(JSON.stringify({ message: "100% down\nretry" }), 1);

    expect(stdout).toContain("100%25 down%0Aretry");
  });

  it("says why when npm can't start", () => {
    // No npm anywhere on PATH.
    const { status, stdout } = run(CLEAN, 0, join(dir, "nothing-here"));

    expect(status).toBe(1);
    expect(stdout).toMatch(/^::error::npm audit didn't finish: .*ENOENT/m);
  });
});
