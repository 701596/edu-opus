-- RPC to accept invite by security code
CREATE OR REPLACE FUNCTION accept_school_invite_by_code(p_code TEXT)
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
  
  -- Find valid invite by security code
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

GRANT EXECUTE ON FUNCTION accept_school_invite_by_code TO authenticated;
