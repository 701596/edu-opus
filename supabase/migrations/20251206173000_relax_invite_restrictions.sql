-- Update Invite System to trust Security Code (Bypassing User Lookup Error)
-- FIXED: Added DROP FUNCTION commands to avoid "cannot change return type" error
-- FIXED: Renamed output parameters to avoid "ambiguous column" error

-- 1. Drop existing functions to allow signature change
DROP FUNCTION IF EXISTS accept_school_invite(TEXT, UUID);
DROP FUNCTION IF EXISTS accept_school_invite_by_code(TEXT, UUID);

-- 2. Recreate functions with new return parameter names
CREATE OR REPLACE FUNCTION accept_school_invite(p_token TEXT, p_user_id UUID DEFAULT NULL)
RETURNS TABLE(res_school_id UUID, res_school_name TEXT, res_role user_role)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_invite school_invites%ROWTYPE;
  v_school schools%ROWTYPE;
  v_user_id UUID;
BEGIN
  IF p_user_id IS NOT NULL THEN
    v_user_id := p_user_id;
  ELSE
    v_user_id := auth.uid();
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required (User ID missing)';
  END IF;

  -- Find valid invite
  SELECT * INTO v_invite FROM school_invites
  WHERE token = p_token 
    AND accepted_at IS NULL 
    AND expires_at > NOW();
  
  IF v_invite IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired invite';
  END IF;
  
  -- Get school details
  SELECT * INTO v_school FROM schools WHERE id = v_invite.school_id;
  
  -- Add user to school
  INSERT INTO school_members (school_id, user_id, role, invited_by, is_active)
  VALUES (v_invite.school_id, v_user_id, v_invite.role, v_invite.invited_by, true)
  ON CONFLICT (school_id, user_id) DO UPDATE SET
    role = EXCLUDED.role,
    is_active = true,
    updated_at = NOW();
  
  -- Mark invite as accepted
  UPDATE school_invites SET
    accepted_at = NOW(),
    accepted_by = v_user_id
  WHERE id = v_invite.id;
  
  RETURN QUERY SELECT v_school.id, v_school.name, v_invite.role;
END;
$$;

CREATE OR REPLACE FUNCTION accept_school_invite_by_code(p_code TEXT, p_user_id UUID DEFAULT NULL)
RETURNS TABLE(res_school_id UUID, res_school_name TEXT, res_role user_role)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_invite school_invites%ROWTYPE;
  v_school schools%ROWTYPE;
  v_user_id UUID;
BEGIN
  IF p_user_id IS NOT NULL THEN
    v_user_id := p_user_id;
  ELSE
    v_user_id := auth.uid();
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required (User ID missing)';
  END IF;

  -- Find valid invite via Code
  SELECT * INTO v_invite FROM school_invites
  WHERE security_code = p_code 
    AND accepted_at IS NULL 
    AND expires_at > NOW();
  
  IF v_invite IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired security code';
  END IF;
  
  -- Get school details
  SELECT * INTO v_school FROM schools WHERE id = v_invite.school_id;
  
  -- Add user to school
  INSERT INTO school_members (school_id, user_id, role, invited_by, is_active)
  VALUES (v_invite.school_id, v_user_id, v_invite.role, v_invite.invited_by, true)
  ON CONFLICT (school_id, user_id) DO UPDATE SET
    role = EXCLUDED.role,
    is_active = true,
    updated_at = NOW();
  
  -- Mark invite as accepted
  UPDATE school_invites SET
    accepted_at = NOW(),
    accepted_by = v_user_id
  WHERE id = v_invite.id;
  
  RETURN QUERY SELECT v_school.id, v_school.name, v_invite.role;
END;
$$;

GRANT EXECUTE ON FUNCTION accept_school_invite TO authenticated, anon;
GRANT EXECUTE ON FUNCTION accept_school_invite_by_code TO authenticated, anon;
