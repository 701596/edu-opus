-- =============================================
-- MIGRATION: RBAC Invitation System
-- Version: 1.0.0
-- PR: rbac/2025_add_school_members_and_roles
-- =============================================

BEGIN;

-- =============================================
-- STEP 1: Create school_invites table
-- =============================================
CREATE TABLE IF NOT EXISTS school_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role user_role NOT NULL,
  token TEXT NOT NULL UNIQUE,
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_school_invites_token ON school_invites(token);
CREATE INDEX IF NOT EXISTS idx_school_invites_email ON school_invites(email);
CREATE INDEX IF NOT EXISTS idx_school_invites_school ON school_invites(school_id);

-- =============================================
-- STEP 2: RLS for school_invites
-- =============================================
ALTER TABLE school_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS school_invites_select ON school_invites;
DROP POLICY IF EXISTS school_invites_insert ON school_invites;
DROP POLICY IF EXISTS school_invites_delete ON school_invites;

-- Principal can see invites for their school
CREATE POLICY school_invites_select ON school_invites FOR SELECT
USING (is_school_principal(school_id));

-- Only principal can create invites
CREATE POLICY school_invites_insert ON school_invites FOR INSERT
WITH CHECK (is_school_principal(school_id));

-- Principal can delete/revoke invites
CREATE POLICY school_invites_delete ON school_invites FOR DELETE
USING (is_school_principal(school_id));

-- =============================================
-- STEP 3: Invite Functions
-- =============================================

-- Create an invite (principal only)
CREATE OR REPLACE FUNCTION create_school_invite(
  p_school_id UUID,
  p_email TEXT,
  p_role user_role,
  p_expires_hours INTEGER DEFAULT 72
)
RETURNS TABLE(invite_id UUID, token TEXT, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token TEXT;
  v_expires_at TIMESTAMPTZ;
  v_invite_id UUID;
BEGIN
  -- Check permission
  IF NOT is_school_principal(p_school_id) THEN
    RAISE EXCEPTION 'Only principals can invite members';
  END IF;
  
  -- Check if user already member
  IF EXISTS (
    SELECT 1 FROM school_members sm
    JOIN auth.users u ON u.id = sm.user_id
    WHERE sm.school_id = p_school_id AND u.email = p_email
  ) THEN
    RAISE EXCEPTION 'User is already a member of this school';
  END IF;
  
  -- Generate secure token
  v_token := encode(gen_random_bytes(32), 'hex');
  v_expires_at := NOW() + (p_expires_hours || ' hours')::INTERVAL;
  
  -- Delete any existing invites for this email/school
  DELETE FROM school_invites 
  WHERE school_id = p_school_id AND email = p_email;
  
  -- Create new invite
  INSERT INTO school_invites (school_id, email, role, token, invited_by, expires_at)
  VALUES (p_school_id, p_email, p_role, v_token, auth.uid(), v_expires_at)
  RETURNING id INTO v_invite_id;
  
  RETURN QUERY SELECT v_invite_id, v_token, v_expires_at;
END;
$$;

-- Accept an invite
CREATE OR REPLACE FUNCTION accept_school_invite(p_token TEXT)
RETURNS TABLE(school_id UUID, school_name TEXT, role user_role)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invite school_invites%ROWTYPE;
  v_school schools%ROWTYPE;
  v_user_email TEXT;
BEGIN
  -- Get current user email
  SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();
  
  IF v_user_email IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  -- Find valid invite
  SELECT * INTO v_invite FROM school_invites
  WHERE token = p_token 
    AND accepted_at IS NULL 
    AND expires_at > NOW();
  
  IF v_invite IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired invite';
  END IF;
  
  -- Check email matches
  IF LOWER(v_invite.email) != LOWER(v_user_email) THEN
    RAISE EXCEPTION 'Invite is for a different email address';
  END IF;
  
  -- Get school details
  SELECT * INTO v_school FROM schools WHERE id = v_invite.school_id;
  
  -- Add user to school
  INSERT INTO school_members (school_id, user_id, role, invited_by, is_active)
  VALUES (v_invite.school_id, auth.uid(), v_invite.role, v_invite.invited_by, true)
  ON CONFLICT (school_id, user_id) DO UPDATE SET
    role = EXCLUDED.role,
    is_active = true,
    updated_at = NOW();
  
  -- Mark invite as accepted
  UPDATE school_invites SET
    accepted_at = NOW(),
    accepted_by = auth.uid()
  WHERE id = v_invite.id;
  
  RETURN QUERY SELECT v_school.id, v_school.name, v_invite.role;
END;
$$;

-- Get pending invites for a school
CREATE OR REPLACE FUNCTION get_school_invites(p_school_id UUID)
RETURNS TABLE(
  id UUID,
  email TEXT,
  role user_role,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT id, email, role, expires_at, created_at
  FROM school_invites
  WHERE school_id = p_school_id
    AND accepted_at IS NULL
    AND expires_at > NOW()
  ORDER BY created_at DESC
$$;

-- Revoke an invite
CREATE OR REPLACE FUNCTION revoke_school_invite(p_invite_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_school_id UUID;
BEGIN
  SELECT school_id INTO v_school_id FROM school_invites WHERE id = p_invite_id;
  
  IF NOT is_school_principal(v_school_id) THEN
    RAISE EXCEPTION 'Only principals can revoke invites';
  END IF;
  
  DELETE FROM school_invites WHERE id = p_invite_id;
  RETURN FOUND;
END;
$$;

-- =============================================
-- STEP 4: Grants
-- =============================================
GRANT SELECT, INSERT, DELETE ON school_invites TO authenticated;
GRANT EXECUTE ON FUNCTION create_school_invite TO authenticated;
GRANT EXECUTE ON FUNCTION accept_school_invite TO authenticated;
GRANT EXECUTE ON FUNCTION get_school_invites TO authenticated;
GRANT EXECUTE ON FUNCTION revoke_school_invite TO authenticated;

COMMIT;
