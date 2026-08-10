-- Least-privilege database roles for ForgeQuote.
--
-- The application currently connects as the database owner, which means an
-- SQL-injection bug (none known — the codebase is ORM-only) or a leaked
-- DATABASE_URL would also grant DROP TABLE and access to every other schema.
-- These roles separate "run the app" from "change the schema".
--
-- Roles created
--   forgequote_migrator  owns the schema; used ONLY by `alembic upgrade`
--   forgequote_app       DML only (SELECT/INSERT/UPDATE/DELETE); used by the API
--   forgequote_readonly  SELECT only; for analytics and support queries
--
-- Usage
--   1. Edit the passwords below (or set them with ALTER ROLE afterwards).
--   2. psql -U postgres -d quote_db -f db_least_privilege.sql
--   3. Point DATABASE_URL at forgequote_app.
--   4. Run migrations with the migrator role:
--        DATABASE_URL=postgresql+asyncpg://forgequote_migrator:...@host/quote_db \
--          alembic upgrade head
--
-- Re-runnable: every statement is guarded or idempotent.

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'forgequote_migrator') THEN
        CREATE ROLE forgequote_migrator LOGIN PASSWORD 'CHANGE_ME_MIGRATOR';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'forgequote_app') THEN
        CREATE ROLE forgequote_app LOGIN PASSWORD 'CHANGE_ME_APP';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'forgequote_readonly') THEN
        CREATE ROLE forgequote_readonly LOGIN PASSWORD 'CHANGE_ME_READONLY';
    END IF;
END
$$;

-- No role may create objects in the database at large.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON DATABASE quote_db FROM PUBLIC;

GRANT CONNECT ON DATABASE quote_db TO forgequote_migrator, forgequote_app, forgequote_readonly;
GRANT USAGE ON SCHEMA public TO forgequote_migrator, forgequote_app, forgequote_readonly;

-- ---------------------------------------------------------------------------
-- Migrator: owns the schema, so it alone may change structure.
-- ---------------------------------------------------------------------------
GRANT CREATE ON SCHEMA public TO forgequote_migrator;
ALTER SCHEMA public OWNER TO forgequote_migrator;

DO $$
DECLARE
    obj record;
BEGIN
    FOR obj IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE format('ALTER TABLE public.%I OWNER TO forgequote_migrator', obj.tablename);
    END LOOP;
    FOR obj IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'public' LOOP
        EXECUTE format('ALTER SEQUENCE public.%I OWNER TO forgequote_migrator', obj.sequencename);
    END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- Application: data only. Notably NOT granted TRUNCATE, DROP, or CREATE, so a
-- compromised application credential cannot destroy the schema.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO forgequote_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO forgequote_app;

-- ---------------------------------------------------------------------------
-- Read-only: analytics and support.
-- ---------------------------------------------------------------------------
GRANT SELECT ON ALL TABLES IN SCHEMA public TO forgequote_readonly;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO forgequote_readonly;

-- ---------------------------------------------------------------------------
-- Tables created by future migrations inherit the same grants automatically.
-- ---------------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES FOR ROLE forgequote_migrator IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO forgequote_app;
ALTER DEFAULT PRIVILEGES FOR ROLE forgequote_migrator IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO forgequote_app;
ALTER DEFAULT PRIVILEGES FOR ROLE forgequote_migrator IN SCHEMA public
    GRANT SELECT ON TABLES TO forgequote_readonly;
ALTER DEFAULT PRIVILEGES FOR ROLE forgequote_migrator IN SCHEMA public
    GRANT SELECT ON SEQUENCES TO forgequote_readonly;

-- ---------------------------------------------------------------------------
-- Verify: forgequote_app must show f (false) for both.
-- ---------------------------------------------------------------------------
SELECT
    rolname,
    rolsuper    AS is_superuser,
    rolcreaterole,
    rolcreatedb
FROM pg_roles
WHERE rolname LIKE 'forgequote%'
ORDER BY rolname;
