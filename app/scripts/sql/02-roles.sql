-- Step 2 of migrate.sh: the app's login role, synapse_app, connected to `postgres`. Roles are
-- cluster-wide, so this runs once per migrate run. After
-- finance-stack/init-db/roles/01-create-roles.sql.
--
-- A guarded CREATE, then an unconditional ALTER that re-asserts every attribute and sets the
-- password from :app_password (SYNAPSE_APP_DB_PASSWORD), so a new password takes effect on the
-- next run, and a role changed by hand is put back. format(%L) quotes the password, and \gexec
-- runs the result, because psql doesn't expand :variables inside dollar quotes.
--
-- What the role may do in each database is in 03-grants.sql.

SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', 'synapse_app', :'app_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'synapse_app')\gexec

SELECT format(
    'ALTER ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS'
    ' PASSWORD %L', 'synapse_app', :'app_password')\gexec
