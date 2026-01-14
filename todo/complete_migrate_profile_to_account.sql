-- =============================================================================
-- Migration: Remove account table, rename profile → account
-- =============================================================================
--
-- ⚠️ NAMING COLLISION - READ CAREFULLY:
--
--   OLD "account" = organization/billing container (REMOVING in Phase 1A)
--   NEW "account" = user identity, renamed from "profile" (Phase 1B)
--
-- ⚠️ EXECUTION ORDER IS MANDATORY:
--
--   PHASE 1A: Remove OLD account infrastructure FIRST
--   PHASE 1B: Rename profile → account SECOND
--
--   DO NOT start Phase 1B until Phase 1A is complete!
--
-- =============================================================================

BEGIN;

-- =============================================================================
-- PHASE 1A: REMOVE OLD ACCOUNT TABLE (org/billing container)
-- =============================================================================
-- The OLD "account" table is the organization/billing entity.
-- We are removing this layer entirely.
-- This MUST be done BEFORE renaming profile to avoid naming collision.
-- =============================================================================

-- Step A1: Create new junction table account_website
--          This will link users directly to websites (removing org layer)
--          Note: account_id column will reference the NEW account table (after rename)
CREATE TABLE account_website (
    account_id INT NOT NULL,
    website_id INT NOT NULL,
    role TEXT DEFAULT 'member',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (account_id, website_id)
);

-- Step A2: Migrate data from old structure to new
--          OLD: profile → account_profile → account → website
--          NEW: account → account_website → website
--          Maps: profile.id → account_website.account_id
INSERT INTO account_website (account_id, website_id, role, created_at)
SELECT ap.profile_id, w.id, ap.role, ap.created_at
FROM account_profile ap
JOIN website w ON w.account_id = ap.account_id;
-- Result: (1, 1, 'owner', '2026-01-02T16:00:36.702Z')

-- Step A3: Drop foreign keys on account_profile junction table
--          Note: website.account_id has no FK constraint in schema
ALTER TABLE account_profile DROP CONSTRAINT account_profile_account_id_fkey;
ALTER TABLE account_profile DROP CONSTRAINT account_profile_profile_id_fkey;

-- Step A4: Drop website.account_id column (ownership now via junction)
ALTER TABLE website DROP COLUMN account_id;

-- Step A5: Drop the old junction table (no longer needed)
DROP TABLE account_profile;

-- Step A6: Drop the OLD account table (org/billing container)
--          ⚠️ AFTER THIS POINT: "account" name is available for reuse
DROP TABLE account;

-- Step A7: Drop the OLD account_id_seq sequence
--          This prevents collision when renaming profile_id_seq → account_id_seq
DROP SEQUENCE IF EXISTS account_id_seq;

-- =============================================================================
-- PHASE 1B: RENAME PROFILE → ACCOUNT (user identity)
-- =============================================================================
-- Now that OLD "account" is gone, we can safely rename "profile" to "account".
-- The "profile" table contains user identity (email, name, etc.)
-- =============================================================================

-- Step B1: Drop FK from auth_session before renaming the table
ALTER TABLE auth_session DROP CONSTRAINT auth_session_profile_id_fkey;

-- Step B2: Rename the profile table to account
--          ⚠️ This is the NEW account table (user identity)
ALTER TABLE profile RENAME TO account;

-- Step B3: Rename associated database objects to match new table name
ALTER SEQUENCE profile_id_seq RENAME TO account_id_seq;
ALTER INDEX profile_pkey RENAME TO account_pkey;
ALTER INDEX profile_email_key RENAME TO account_email_key;
ALTER TRIGGER profile_updated_at ON account RENAME TO account_updated_at;

-- Step B4: Update auth_session: rename column and recreate FK to NEW account
ALTER TABLE auth_session RENAME COLUMN profile_id TO account_id;
ALTER INDEX idx_auth_session_profile RENAME TO idx_auth_session_account;
ALTER TABLE auth_session
    ADD CONSTRAINT auth_session_account_id_fkey
    FOREIGN KEY (account_id) REFERENCES account(id) ON DELETE CASCADE;

-- Step B5: Add FKs to account_website (now that NEW account table exists)
ALTER TABLE account_website
    ADD CONSTRAINT account_website_account_id_fkey
    FOREIGN KEY (account_id) REFERENCES account(id) ON DELETE CASCADE;
ALTER TABLE account_website
    ADD CONSTRAINT account_website_website_id_fkey
    FOREIGN KEY (website_id) REFERENCES website(id) ON DELETE CASCADE;

-- Step B6: Add index for reverse lookups on junction table
CREATE INDEX idx_account_website_website_id ON account_website(website_id);

COMMIT;

-- =============================================================================
-- VERIFICATION QUERIES (run after migration)
-- =============================================================================
-- SELECT * FROM account;
--   Expected: id=1, email="pantolingo@seefusiontech.com", name="Winston Williams"
--
-- SELECT * FROM account_website;
--   Expected: account_id=1, website_id=1, role="owner"
--
-- SELECT * FROM website;
--   Expected: id=1, domain="www.esnipe.com" (NO account_id column)
--
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'website';
--   Should NOT include "account_id"
