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

// Everything that decides what npm audits is on the command line, which outranks the environment
// and every .npmrc. Left to them, `offline` skips the registry and prints a report that looks
// clean, `optional=false` drops runtime packages, and `include=dev` adds the dev tree. The cache is
// a fresh one each run, because npm keeps an advisory's severity from its cache while the
// advisory's range is unchanged, so a re-scored advisory would keep its old severity. npm's debug
// log goes to the temporary directory rather than into that cache, which is removed.
const ARGS = [
  "audit",
  "--omit=dev",
  "--include=optional",
  "--include=peer",
  "--offline=false",
  "--json",
  "--no-update-notifier",
  `--logs-dir=${tmpdir()}`,
];

function audit(): string {
  const cache = mkdtempSync(join(tmpdir(), "check-audit-"));
  try {
    return execFileSync("npm", [...ARGS, `--cache=${cache}`], {
      cwd: APP,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "inherit"],
    });
  } catch (error) {
    // npm audit exits 1 whenever it finds an advisory, the normal case here, with the report on
    // stdout. With no exit status, npm didn't start (ENOENT) or was stopped (a signal, or output
    // past maxBuffer), so say so, since the gate can only see what npm printed.
    const { status, signal, message, stdout } = error as {
      status?: number | null;
      signal?: string | null;
      message?: string;
      stdout?: unknown;
    };
    if (typeof status !== "number") {
      const stopped = signal ? ` (${signal})` : "";
      console.log(`::error::${escape(`npm audit didn't finish: ${message}${stopped}`)}`);
    }
    return String(stdout ?? "");
  } finally {
    rmSync(cache, { recursive: true, force: true });
  }
}

const report = runGate({
  auditOutput: audit(),
  allowlist: readFileSync(join(APP, ".audit-allowlist"), "utf8"),
  today: new Date().toISOString().slice(0, 10),
});

// Notes carry advisory titles from npm, so they're annotations too: a line that doesn't start with
// `::` can still run a command the runner finds in it.
for (const note of report.notes) console.log(`::notice::${escape(note)}`);
for (const warning of report.warnings) console.log(`::warning::${escape(warning)}`);
for (const error of report.errors) console.log(`::error::${escape(error)}`);
console.log(report.summary);
process.exitCode = report.ok ? 0 : 1;
