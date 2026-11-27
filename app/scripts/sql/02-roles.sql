-- Step 2 of migrate.sh: the app's login role, synapse_app, connected to `postgres`. Roles are
-- cluster-wide, so this runs once per migrate run. After
-- finance-stack/init-db/roles/01-create-roles.sql.
--
-- A guarded CREATE, then an unconditional ALTER that re-asserts every attribute and sets the
-- password from SYNAPSE_APP_DB_PASSWORD, so a new password takes effect on the next run, and a
-- role changed by hand is put back. \getenv reads it from the environment rather than psql's
-- command line, where `ps` would show it. format(%L) quotes it, and \gexec runs the result,
-- because psql doesn't expand :variables inside dollar quotes. \getenv needs psql 15 or later.
--
-- ALTER ROLE ... PASSWORD sends the password to the server in plain text, so log_statement and
-- log_min_error_statement must stay at their defaults on this cluster, or it lands in the log.
--
-- What the role may do in each database is in 03-grants.sql.

\getenv app_password SYNAPSE_APP_DB_PASSWORD

SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', 'synapse_app', :'app_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'synapse_app')\gexec

SELECT format(
    'ALTER ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS'
    ' PASSWORD %L', 'synapse_app', :'app_password')\gexec
