// `npm run check:audit`, the Dependency audit step in CI's Verify: audits the runtime tree (the
// dependencies that ship in the app) and fails on any HIGH or CRITICAL advisory that
// app/.audit-allowlist doesn't allow. audit-allowlist.ts decides. This runs npm, reads the file,
// and prints the result, with GitHub annotations for the errors and warnings.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { runGate } from "./audit-allowlist";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");

function audit(): string {
  try {
    return execFileSync("npm", ["audit", "--omit=dev", "--json"], {
      cwd: APP,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "inherit"],
    });
  } catch (error) {
    // npm audit exits 1 whenever it finds an advisory, the normal case here, with the report on
    // stdout. When the audit itself fails, stdout has npm's error or nothing, and the gate fails.
    return String((error as { stdout?: unknown }).stdout ?? "");
  }
}

// A workflow command ends at a newline, so the message's own are escaped, as GitHub's workflow
// commands reference says.
const escape = (message: string) =>
  message.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");

const report = runGate({
  auditOutput: audit(),
  allowlist: readFileSync(join(APP, ".audit-allowlist"), "utf8"),
  today: new Date().toISOString().slice(0, 10),
});

for (const note of report.notes) console.log(note);
for (const warning of report.warnings) console.log(`::warning::${escape(warning)}`);
for (const error of report.errors) console.log(`::error::${escape(error)}`);
console.log(report.summary);
process.exitCode = report.ok ? 0 : 1;
