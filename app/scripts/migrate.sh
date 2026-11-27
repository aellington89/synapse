#!/usr/bin/env bash
# Synapse's migration job: the `migrate` service runs it on every `docker compose up`, CI runs it
# against its Postgres service, and `npm run db:migrate:test` runs it for synapse_test. It's
# idempotent. After finance-stack/app/scripts/migrate-and-seed.sh.
#
# As the superuser in PGHOST, PGPORT, PGUSER, and PGPASSWORD, it:
#   1. creates each database in SYNAPSE_DATABASES (default "synapse synapse_test") if it's missing;
#   2. creates the login role synapse_app if it's missing, then re-asserts its attributes and sets
#      its password from SYNAPSE_APP_DB_PASSWORD, so a new password takes effect on the next run;
#   3. applies the Drizzle migrations to each database;
#   4. applies the grants to each database, which revoke everything first, so sql/03-grants.sql
#      is the single authority on what synapse_app may do.
#
# Steps 1 and 2 connect to `postgres`, the one database that always exists (PGDATABASE may name
# one that doesn't yet). The role is cluster-wide, so step 2 runs whichever databases are named.
# The grants name tables, so they run after the migrations that create them.
#
# It stops before connecting if a variable is missing, if a password holds a character that a
# connection URL would need escaped, or if a database name isn't a plain lowercase identifier or
# is one of Postgres's own. Otherwise it names the step that failed.
# -E: the ERR trap below also fires for a command that fails inside run_psql.
set -Eeuo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SQL_DIR="${APP_DIR}/scripts/sql"
# drizzle-kit reads drizzle.config.ts from the working directory.
cd "${APP_DIR}"

fail() {
  echo "migrate.sh: $*" >&2
  exit 1
}

for var in PGHOST PGPORT PGUSER PGPASSWORD SYNAPSE_APP_DB_PASSWORD; do
  [ -n "${!var:-}" ] || fail "${var} must be set and not empty (see .env.example)."
done

# They go into connection URLs unescaped: drizzle-kit's DATABASE_URL below, and the app's.
for var in PGHOST PGUSER PGPASSWORD SYNAPSE_APP_DB_PASSWORD; do
  hint=""
  [[ "${var}" == *PASSWORD ]] && hint=" Generate a password with: openssl rand -hex 24"
  [[ "${!var}" =~ ^[A-Za-z0-9._~-]+$ ]] ||
    fail "${var} may hold only A-Z, a-z, 0-9, and . _ ~ - because it goes into a connection URL unescaped.${hint}"
done

# Unset means both; set but empty is refused below, so a wrapper that passes an empty value can't
# fall back to the real synapse database.
read -r -a DATABASES <<<"${SYNAPSE_DATABASES-synapse synapse_test}"
[ "${#DATABASES[@]}" -gt 0 ] || fail "SYNAPSE_DATABASES names no database."
for db in "${DATABASES[@]}"; do
  [[ "${db}" =~ ^[a-z_][a-z0-9_]*$ ]] ||
    fail "SYNAPSE_DATABASES: \"${db}\" isn't a lowercase name of letters, digits, and underscores."
  # The grants revoke PUBLIC's CONNECT, which every role needs on the maintenance databases.
  [[ "${db}" != postgres && "${db}" != template* ]] ||
    fail "SYNAPSE_DATABASES: \"${db}\" is one of Postgres's own databases."
done

step="starting"
trap 'echo "migrate.sh: failed while ${step}." >&2' ERR

run_psql() {
  psql --no-psqlrc --quiet -v ON_ERROR_STOP=1 "$@"
}

for db in "${DATABASES[@]}"; do
  step="creating the database ${db}"
  echo ">>> Creating ${db} if it's missing"
  run_psql -d postgres -v db="${db}" -f "${SQL_DIR}/01-databases.sql"
done

step="creating the role synapse_app"
echo ">>> Creating synapse_app if it's missing, and setting its attributes and password"
# The SQL reads the password from the environment, so it's never on psql's command line.
run_psql -d postgres -f "${SQL_DIR}/02-roles.sql"

for db in "${DATABASES[@]}"; do
  step="migrating ${db}"
  echo ">>> Migrating ${db}"
  DATABASE_URL="postgresql://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT}/${db}" \
    node_modules/.bin/drizzle-kit migrate
  echo # drizzle-kit ends its last line without a newline.

  step="applying the grants to ${db}"
  echo ">>> Applying the grants to ${db}"
  run_psql -d "${db}" -v OWNER="${PGUSER}" -f "${SQL_DIR}/03-grants.sql"
done

echo ">>> Done: ${DATABASES[*]}"
