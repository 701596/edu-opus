-- RPC: Update Member Role
CREATE OR REPLACE FUNCTION update_member_role(
  p_member_id UUID,
  p_new_role user_role
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_school_id UUID;
BEGIN
  -- Get school_id from member record
  SELECT school_id INTO v_school_id FROM school_members WHERE id = p_member_id;
  
  -- Verify Principal permissions
  IF NOT is_school_principal(v_school_id) THEN
     RAISE EXCEPTION 'Only principals can update member roles';
  END IF;

  -- Update role
  UPDATE school_members 
  SET role = p_new_role, updated_at = NOW()
  WHERE id = p_member_id;

  RETURN FOUND;
END;
$$;

-- RPC: Remove (Deactivate) Member
CREATE OR REPLACE FUNCTION remove_member(p_member_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_school_id UUID;
BEGIN
  SELECT school_id INTO v_school_id FROM school_members WHERE id = p_member_id;
  
  IF NOT is_school_principal(v_school_id) THEN
     RAISE EXCEPTION 'Only principals can remove members';
  END IF;

  -- Delete member (or could set is_active = false)
  DELETE FROM school_members WHERE id = p_member_id;
  
  RETURN FOUND;
END;
$$;

-- Update accept invite by code to be lenient if already member
CREATE OR REPLACE FUNCTION accept_school_invite_by_code(p_code TEXT)
RETURNS TABLE(school_id UUID, school_name TEXT, role user_role)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invite school_invites%ROWTYPE;
  v_school schools%ROWTYPE;
  v_user_email TEXT;
  v_existing_member school_members%ROWTYPE;
BEGIN
  -- Get current user email
  SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();
  
  IF v_user_email IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Find valid invite by security code (IGNORING expiry for the code usage, or expecting extended expiry)
  -- User requested "security code should not be expired".
  -- We'll allow finding it even if date is past, but still check if it exists.
  SELECT * INTO v_invite FROM school_invites
  WHERE security_code = p_code 
  LIMIT 1;
  
  IF v_invite IS NULL THEN
    RAISE EXCEPTION 'Invalid security code';
  END IF;
  
  -- Check email matches
  IF LOWER(v_invite.email) != LOWER(v_user_email) THEN
    RAISE EXCEPTION 'This security code is for a different email address';
  END IF;

  -- Get school details
  SELECT * INTO v_school FROM schools WHERE id = v_invite.school_id;

  -- Check if already a member
  SELECT * INTO v_existing_member 
  FROM school_members 
  WHERE school_id = v_invite.school_id AND user_id = auth.uid();

  IF v_existing_member IS NOT NULL AND v_existing_member.is_active = true THEN
      -- Already joined! Just return success so they get logged in/redirected.
      RETURN QUERY SELECT v_school.id, v_school.name, v_existing_member.role;
      RETURN;
  END IF;

  -- Join logic if not already member
  
  -- Add user
  INSERT INTO school_members (school_id, user_id, role, invited_by, is_active)
  VALUES (v_invite.school_id, auth.uid(), v_invite.role, v_invite.invited_by, true)
  ON CONFLICT (school_id, user_id) DO UPDATE SET
    role = EXCLUDED.role,
    is_active = true,
    updated_at = NOW();
  
  -- Mark invite as accepted (Update: keep it for record/code lookup? No, standard flow consumes it)
  -- User says "security code should be saved as roles history... should not be expired"
  -- If we mark it accepted, can they reuse it? 
  -- We should PROBABLY NOT mark accepted_at if we want it reusable?
  -- OR we mark it, but the lookup above ignores accepted_at IS NULL check.
  
  -- Let's update the lookup above to ignore accepted_at IS NULL.
  -- AND update this to mark accepted_at so we know they joined once.
  
  UPDATE school_invites SET
    accepted_at = NOW(),
    accepted_by = auth.uid()
  WHERE id = v_invite.id AND accepted_at IS NULL;
  
  RETURN QUERY SELECT v_school.id, v_school.name, v_invite.role;
END;
$$;

GRANT EXECUTE ON FUNCTION update_member_role TO authenticated;
GRANT EXECUTE ON FUNCTION remove_member TO authenticated;
