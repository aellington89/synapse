// `npm run check:audit`, the Dependency audit step in CI's Verify: runs `npm audit --omit=dev`
// and fails on any HIGH or CRITICAL advisory that app/.audit-allowlist doesn't allow.
// audit-allowlist.ts decides. This runs npm, reads the file, and prints the result as GitHub
// annotations.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { runGate } from "./audit-allowlist";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");

// A workflow command ends at a newline, so the message's own are escaped, as GitHub's workflow
// commands reference says.
const escape = (message: string) =>
  message.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");

const FAILED = "✗ Dependency audit (runtime) failed.";

// Everything that decides what npm audits is on the command line, which outranks the environment
// and every .npmrc. Left to them, `offline` skips the registry and prints a report that looks
// clean, `optional=false` drops runtime packages, `include=dev` adds the dev tree, and `registry`
// decides who answers the advisory request: a mirror's answer would stand in for npm's advisory
// database. Every dependency is public, so npm's registry serves the rest of the audit too. The
// cache is a fresh one each run, because npm keeps an advisory's severity from its cache while the
// advisory's range is unchanged, so a re-scored advisory would keep its old severity. npm's debug
// log goes to the temporary directory rather than into that cache, which is removed.
const ARGS = [
  "audit",
  "--omit=dev",
  "--include=optional",
  "--include=peer",
  "--offline=false",
  "--registry=https://registry.npmjs.org/",
  "--json",
  "--no-update-notifier",
  `--logs-dir=${tmpdir()}`,
];

/** What npm printed, or why the audit didn't finish. */
function audit(): { output: string } | { failure: string } {
  const cache = mkdtempSync(join(tmpdir(), "check-audit-"));
  try {
    return {
      output: execFileSync("npm", [...ARGS, `--cache=${cache}`], {
        cwd: APP,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        stdio: ["ignore", "pipe", "inherit"],
      }),
    };
  } catch (error) {
    const { status, signal, message, stdout } = error as {
      status?: number | null;
      signal?: string | null;
      message?: string;
      stdout?: unknown;
    };
    // npm audit exits 1 whenever it finds an advisory, the normal case here, with the report on
    // stdout. With no exit status, npm didn't start (ENOENT) or was stopped (a signal, or output
    // past maxBuffer). Its output may then be cut short, or whole but unfinished, so the gate fails
    // rather than decide from it.
    if (typeof status === "number") return { output: String(stdout ?? "") };
    const stopped = signal ? ` (${signal})` : "";
    return { failure: `npm audit didn't finish: ${message}${stopped}` };
  } finally {
    rmSync(cache, { recursive: true, force: true });
  }
}

/** The allowlist's text, or why it can't be read. */
function readAllowlist(): { text: string } | { problem: string } {
  try {
    return { text: readFileSync(join(APP, ".audit-allowlist"), "utf8") };
  } catch (error) {
    // Missing isn't read as empty: the gate would then fail every advisory its entries allowed,
    // with no word of why. So it fails here, before running npm, and says what to restore.
    if ((error as { code?: unknown }).code === "ENOENT") {
      return {
        problem:
          "app/.audit-allowlist is missing. Restore it, with its header if it has no entries " +
          "(git restore app/.audit-allowlist), and run the audit again.",
      };
    }
    return { problem: `app/.audit-allowlist can't be read: ${(error as Error).message}` };
  }
}

function main(): number {
  const allowlist = readAllowlist();
  if ("problem" in allowlist) {
    console.log(`::error::${escape(allowlist.problem)}`);
    console.log(FAILED);
    return 1;
  }

  const audited = audit();
  if ("failure" in audited) {
    console.log(`::error::${escape(audited.failure)}`);
    console.log(FAILED);
    return 1;
  }

  const report = runGate({
    auditOutput: audited.output,
    allowlist: allowlist.text,
    today: new Date().toISOString().slice(0, 10),
  });

  // Notes carry advisory titles from npm, so they're annotations too: a line that doesn't start
  // with `::` can still run a command the runner finds in it.
  for (const note of report.notes) console.log(`::notice::${escape(note)}`);
  for (const warning of report.warnings) console.log(`::warning::${escape(warning)}`);
  for (const error of report.errors) console.log(`::error::${escape(error)}`);
  console.log(report.summary);
  return report.ok ? 0 : 1;
}

process.exitCode = main();
