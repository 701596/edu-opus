-- =============================================
-- MIGRATION: Invite Audit Table
-- Version: 1.0.0
-- Date: 2025-12-09
-- =============================================
-- 
-- ROLLBACK INSTRUCTIONS:
-- DROP TABLE IF EXISTS invite_audit CASCADE;
--
-- =============================================

BEGIN;

-- =============================================
-- STEP 1: Create invite_audit table
-- =============================================
CREATE TABLE IF NOT EXISTS public.invite_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_id UUID REFERENCES school_invites(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  actor_id UUID,
  meta JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- STEP 2: Create indexes
-- =============================================
CREATE INDEX IF NOT EXISTS idx_invite_audit_invite_id ON invite_audit(invite_id);
CREATE INDEX IF NOT EXISTS idx_invite_audit_actor_id ON invite_audit(actor_id);
CREATE INDEX IF NOT EXISTS idx_invite_audit_created_at ON invite_audit(created_at DESC);

-- =============================================
-- STEP 3: Enable RLS
-- =============================================
ALTER TABLE invite_audit ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS invite_audit_select ON invite_audit;
DROP POLICY IF EXISTS invite_audit_insert ON invite_audit;

-- Principals can view audit logs for invites in their school
CREATE POLICY invite_audit_select ON invite_audit FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM school_invites si
    WHERE si.id = invite_audit.invite_id
    AND is_school_principal(si.school_id)
  )
);

-- Only service role can insert (edge functions use service role key)
-- No INSERT policy for regular authenticated users
-- Edge functions bypass RLS with service role

-- =============================================
-- STEP 4: Grants
-- =============================================
GRANT SELECT ON invite_audit TO authenticated;

-- =============================================
-- STEP 5: Comments
-- =============================================
COMMENT ON TABLE invite_audit IS 'Audit trail for invite actions (create, accept, revoke, expire)';
COMMENT ON COLUMN invite_audit.action IS 'Action type: CREATED, ACCEPTED, REVOKED, EXPIRED';
COMMENT ON COLUMN invite_audit.meta IS 'Additional metadata (role, school_id, etc). Never contains security_code.';

COMMIT;
