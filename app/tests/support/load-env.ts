import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Loads app/.env.local when it exists, without overriding what's already set. CI has no such
 * file: its job sets the same variables.
 */
export function loadLocalEnv(): void {
  const file = join(dirname(fileURLToPath(import.meta.url)), "../../.env.local");
  if (existsSync(file)) process.loadEnvFile(file);
}
