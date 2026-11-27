import { defineConfig } from "drizzle-kit";

// `npm run db:generate` writes a migration from drizzle/schema.ts without connecting. Applying
// one is migrate.sh's job, which sets a superuser DATABASE_URL for that one command and then
// applies the grants. DATABASE_URL in app/.env.local is synapse_app's, which can't run DDL, so
// there's no plain `db:migrate` (after finance-stack/app/drizzle.config.ts).
export default defineConfig({
  dialect: "postgresql",
  schema: "./drizzle/schema.ts",
  out: "./drizzle/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
