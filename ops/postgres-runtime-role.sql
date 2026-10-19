-- Run manually with psql as the database owner AFTER migrations, against the
-- intended Poduna database only. No password embedded or sent in command args.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='poduna_app') THEN
    CREATE ROLE poduna_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END $$;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO poduna_app;
-- Exact table list: future tables do not silently inherit write permissions.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  anonymous_devices, shared_lists, shared_items, list_members, list_invitations,
  deleted_lists, community_product_proposals, community_daily_writes,
  community_proposal_confirmations, community_proposal_reports,
  community_contributor_restrictions, contact_messages, device_access_blocks TO poduna_app;
GRANT SELECT, INSERT, DELETE ON access_events TO poduna_app;
GRANT SELECT, INSERT ON security_decisions TO poduna_app;
GRANT USAGE ON SEQUENCE access_events_id_seq, security_decisions_id_seq TO poduna_app;
REVOKE UPDATE, DELETE, TRUNCATE ON security_decisions FROM poduna_app;
GRANT SELECT, INSERT ON admin_decisions TO poduna_app;
GRANT USAGE ON SEQUENCE admin_decisions_id_seq TO poduna_app;
REVOKE UPDATE, DELETE, TRUNCATE ON admin_decisions FROM poduna_app;
GRANT SELECT ON _sqlx_migrations TO poduna_app;
COMMIT;
-- Set/rotate the role password separately using: \password poduna_app
-- Review pre-existing memberships/grants: backend startup rejects unsafe roles.
