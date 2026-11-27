-- Step 4 of migrate.sh: what synapse_app may do in this database, after the migrations have
-- created its tables. After finance-stack/init-db/roles/02-grants.sql.
--
-- psql variables: OWNER, the superuser that runs the migrations and so owns the tables (PGUSER),
-- and DBNAME, which psql sets from the connection.
--
-- synapse_app gets CONNECT, USAGE on `public`, SELECT, INSERT, UPDATE, and DELETE on every table
-- in `public` except `users`, where it has SELECT only, and USAGE and SELECT on the sequences.
-- No CREATE on the database or the schema, no TRUNCATE, and nothing on the `drizzle` migration
-- ledger. The tables stay owned by OWNER, so the role can't alter or drop them: a compromised
-- app can't change the schema or, once sign-in exists (#44), mint an account.

-- One transaction: between the revokes and the grants, a running app would have no privileges.
BEGIN;

-- Nothing is implicit. PUBLIC (every role, now and later) loses CONNECT and TEMP on the database
-- and CREATE on `public`. Postgres 15 and later don't grant that CREATE, and this keeps a restored
-- dump or a grant run by hand from widening it.
REVOKE ALL ON DATABASE :"DBNAME" FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- Everything synapse_app holds here goes first, so narrowing a grant below narrows it in every
-- database, not only new ones.
REVOKE ALL ON DATABASE :"DBNAME" FROM synapse_app;
REVOKE ALL ON SCHEMA public FROM synapse_app;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM synapse_app;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM synapse_app;
REVOKE ALL ON SCHEMA drizzle FROM synapse_app;
REVOKE ALL ON ALL TABLES IN SCHEMA drizzle FROM synapse_app;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA drizzle FROM synapse_app;
ALTER DEFAULT PRIVILEGES FOR ROLE :"OWNER" IN SCHEMA public
    REVOKE ALL ON TABLES FROM synapse_app;
ALTER DEFAULT PRIVILEGES FOR ROLE :"OWNER" IN SCHEMA public
    REVOKE ALL ON SEQUENCES FROM synapse_app;

GRANT CONNECT ON DATABASE :"DBNAME" TO synapse_app;
GRANT USAGE ON SCHEMA public TO synapse_app;

-- Every table, then the one exception, rather than a list: a table a later migration adds is the
-- app's to use without a change here.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO synapse_app;

-- Accounts are created by the owner CLI (#44), as the superuser, never by the app.
REVOKE INSERT, UPDATE, DELETE ON users FROM synapse_app;

-- USAGE and SELECT allow nextval and currval, not setval.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO synapse_app;

-- Tables and sequences OWNER creates later. Default privileges attach when an object is created,
-- so the GRANT ... ON ALL statements above are what cover the ones that already exist.
ALTER DEFAULT PRIVILEGES FOR ROLE :"OWNER" IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO synapse_app;
ALTER DEFAULT PRIVILEGES FOR ROLE :"OWNER" IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO synapse_app;

COMMIT;
