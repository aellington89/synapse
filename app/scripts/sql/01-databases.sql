-- Step 1 of migrate.sh: create the database :db if it's missing, connected to `postgres`.
-- After finance-stack/init-db/roles/00-create-databases.sql.
--
-- psql doesn't expand :variables inside dollar quotes, so a DO block can't take the name. This
-- builds the statement with format(), which quotes it, and runs it with \gexec. CREATE DATABASE
-- can't run in a transaction, and \gexec runs it on its own.

SELECT format('CREATE DATABASE %I', :'db')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'db')\gexec
