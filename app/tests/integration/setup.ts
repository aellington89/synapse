import { assertTestDatabase } from "../support/assert-test-database";
import { loadLocalEnv } from "../support/load-env";

// Vitest's global setup for the integration project: before any test file loads, read
// app/.env.local and refuse to run unless it names synapse_test (AC7).
export default function setup() {
  loadLocalEnv();
  assertTestDatabase(process.env, "Integration tests");
}
