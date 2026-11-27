// The check that stops the migrate test and `db:migrate:test` from setting synapse_app's
// cluster-wide password to a stale value from app/.env.local (AC7). Each case passes an env
// without CI, so it runs the check that CI itself skips.

import { describe, expect, it } from "vitest";

import { APP_PASSWORD_MISMATCH, assertAppPasswordMatches } from "@/tests/support/app-password";
import { appRole, withClient } from "@/tests/support/pg";

const local = { ...process.env, CI: undefined };

describe("assertAppPasswordMatches", () => {
  it("passes when the password matches the role's", async () => {
    await expect(assertAppPasswordMatches(local)).resolves.toBeUndefined();
  });

  it("throws when it doesn't, and leaves the role's password as it was", async () => {
    await expect(
      assertAppPasswordMatches({ ...local, SYNAPSE_APP_DB_PASSWORD: "not-the-password" }),
    ).rejects.toThrow(APP_PASSWORD_MISMATCH);

    await expect(
      withClient(appRole(process.env, "postgres"), () => Promise.resolve("ok")),
    ).resolves.toBe("ok");
  });

  it("rethrows any other error as it is, such as the superuser's own refusal", async () => {
    const error = await assertAppPasswordMatches({
      ...local,
      PGPASSWORD: "not-the-password",
    }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: "28P01" });
    expect((error as Error).message).not.toBe(APP_PASSWORD_MISMATCH);
  });

  it("does nothing with CI set", async () => {
    await expect(
      assertAppPasswordMatches({ CI: "true", PGHOST: "unreachable.invalid", PGPORT: "1" }),
    ).resolves.toBeUndefined();
  });
});
