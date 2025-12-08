-- 0. Drop old functions to avoid "not unique" / ambiguity errors
DROP FUNCTION IF EXISTS accept_school_invite(TEXT);
DROP FUNCTION IF EXISTS accept_school_invite_by_code(TEXT);

-- 1. Update token-based acceptance (for AcceptInvite.tsx)
CREATE OR REPLACE FUNCTION accept_school_invite(p_token TEXT, p_user_id UUID DEFAULT NULL)
RETURNS TABLE(school_id UUID, school_name TEXT, role user_role)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invite school_invites%ROWTYPE;
  v_school schools%ROWTYPE;
  v_user_id UUID;
  v_user_email TEXT;
BEGIN
  -- Determine user_id: prefer explicit param (from fresh login), fallback to session
  IF p_user_id IS NOT NULL THEN
    v_user_id := p_user_id;
  ELSE
    v_user_id := auth.uid();
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required (User ID missing)';
  END IF;

  -- Verify user exists in auth.users
  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
  IF v_user_email IS NULL THEN
     RAISE EXCEPTION 'User not found in system (ID: %). Please clear cookies and try again.', v_user_id;
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
    RAISE EXCEPTION 'Invite is for % but you are logged in as %', v_invite.email, v_user_email;
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


-- 2. Update code-based acceptance (for Auth.tsx)
CREATE OR REPLACE FUNCTION accept_school_invite_by_code(p_code TEXT, p_user_id UUID DEFAULT NULL)
RETURNS TABLE(school_id UUID, school_name TEXT, role user_role)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invite school_invites%ROWTYPE;
  v_school schools%ROWTYPE;
  v_user_id UUID;
  v_user_email TEXT;
BEGIN
  -- Determine user_id: prefer explicit param (from fresh login), fallback to session
  IF p_user_id IS NOT NULL THEN
    v_user_id := p_user_id;
  ELSE
    v_user_id := auth.uid();
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required (User ID missing)';
  END IF;

  -- Verify user exists in auth.users
  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
  IF v_user_email IS NULL THEN
     RAISE EXCEPTION 'User not found in system (ID: %).', v_user_id;
  END IF;
  
  -- Find valid invite
  SELECT * INTO v_invite FROM school_invites
  WHERE security_code = p_code 
    AND accepted_at IS NULL 
    AND expires_at > NOW();
  
  IF v_invite IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired security code';
  END IF;
  
  -- Check email matches
  IF LOWER(v_invite.email) != LOWER(v_user_email) THEN
    RAISE EXCEPTION 'This security code is for a different email address';
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
