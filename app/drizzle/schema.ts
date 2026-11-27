import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// The one owner's account, read by sign-in (#44). synapse_app can read it but not write it: the
// owner CLI creates and resets it as the superuser (app/scripts/sql/03-grants.sql). No role
// column: there's one owner, and Phase 6 adds accounts.
export const users = pgTable(
  "users",
  {
    // uuidv7() is built into Postgres 18: time-ordered ids, so inserts stay at the index's end.
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    username: text("username").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("users_username_not_empty", sql`${table.username} <> ''`)],
);
