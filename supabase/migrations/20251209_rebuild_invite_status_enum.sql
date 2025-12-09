-- =============================================
-- MIGRATION: Secure Invite System - Status Enum & Schema
-- Version: 1.0.0
-- Date: 2025-12-09
-- =============================================
-- 
-- ROLLBACK INSTRUCTIONS:
-- To rollback this migration:
-- 1. DROP TYPE IF EXISTS invite_status CASCADE;
-- 2. ALTER TABLE school_invites DROP COLUMN IF EXISTS status;
-- 3. Remove any indexes created by this migration
--
-- =============================================

BEGIN;

-- =============================================
-- STEP 1: Create invite_status enum (idempotent)
-- =============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invite_status') THEN
    CREATE TYPE invite_status AS ENUM ('pending', 'accepted', 'revoked', 'expired');
  END IF;
END$$;

-- =============================================
-- STEP 2: Update school_invites table schema
-- =============================================

-- Add status column if not exists
ALTER TABLE school_invites 
ADD COLUMN IF NOT EXISTS status invite_status DEFAULT 'pending';

-- Ensure security_code column exists (from previous migration)
ALTER TABLE school_invites 
ADD COLUMN IF NOT EXISTS security_code TEXT;

-- =============================================
-- STEP 3: Create indexes (idempotent)
-- =============================================

-- Unique index on token
DROP INDEX IF EXISTS idx_school_invites_token_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_school_invites_token_unique 
ON school_invites(token);

-- Index on school_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_school_invites_school_id 
ON school_invites(school_id);

-- Index on status for filtering
CREATE INDEX IF NOT EXISTS idx_school_invites_status 
ON school_invites(status);

-- Index on email for duplicate checks
CREATE INDEX IF NOT EXISTS idx_school_invites_email_school 
ON school_invites(school_id, email);

-- =============================================
-- STEP 4: Update existing data (set status based on accepted_at)
-- =============================================
UPDATE school_invites 
SET status = 'accepted' 
WHERE accepted_at IS NOT NULL AND status = 'pending';

UPDATE school_invites 
SET status = 'expired' 
WHERE expires_at < NOW() AND accepted_at IS NULL AND status = 'pending';

-- =============================================
-- STEP 5: Add comment for documentation
-- =============================================
COMMENT ON TABLE school_invites IS 
'Staff invitation system with security codes. 
Status: pending (awaiting acceptance), accepted (user joined), revoked (admin canceled), expired (past expires_at).
Token is unique per invite, security_code is shared with invitee out-of-band.';

COMMENT ON COLUMN school_invites.status IS 'Current state of invite: pending, accepted, revoked, expired';
COMMENT ON COLUMN school_invites.security_code IS '6-character alphanumeric code shared with invitee for verification';
COMMENT ON COLUMN school_invites.token IS 'Unique URL token for invite link';

COMMIT;
