-- Fix search_path for SECUIRTY DEFINER functions to ensure access to auth schema
-- This resolves the "User not found in system" error when accepting invites

CREATE OR REPLACE FUNCTION accept_school_invite(p_token TEXT, p_user_id UUID DEFAULT NULL)
RETURNS TABLE(school_id UUID, school_name TEXT, role user_role)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
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
  -- Explicitly checking auth.users with correct search_path
  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
  
  IF v_user_email IS NULL THEN
     -- Debug: If main select fails, try to count to distinguish between "no row" and "null email"
     DECLARE
       v_exists boolean;
     BEGIN
       SELECT EXISTS(SELECT 1 FROM auth.users WHERE id = v_user_id) INTO v_exists;
       IF v_exists THEN
          -- User exists but email is null? Should not happen for email/password auth
          RAISE EXCEPTION 'User exists but email is inaccessible (ID: %).', v_user_id;
       ELSE
          RAISE EXCEPTION 'User not found in system (ID: %).', v_user_id;
       END IF;
     END;
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


-- Apply same fix to code-based acceptance
CREATE OR REPLACE FUNCTION accept_school_invite_by_code(p_code TEXT, p_user_id UUID DEFAULT NULL)
RETURNS TABLE(school_id UUID, school_name TEXT, role user_role)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
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
    DECLARE
       v_exists boolean;
     BEGIN
       SELECT EXISTS(SELECT 1 FROM auth.users WHERE id = v_user_id) INTO v_exists;
       IF v_exists THEN
          RAISE EXCEPTION 'User exists but email is inaccessible (ID: %).', v_user_id;
       ELSE
          RAISE EXCEPTION 'User not found in system (ID: %).', v_user_id;
       END IF;
     END;
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
