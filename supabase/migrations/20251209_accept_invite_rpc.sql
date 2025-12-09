-- =============================================
-- MIGRATION: Accept Invite RPC Function
-- Version: 1.0.0
-- Date: 2025-12-09
-- =============================================
-- 
-- ROLLBACK INSTRUCTIONS:
-- DROP FUNCTION IF EXISTS accept_invite_by_code(TEXT, TEXT);
-- DROP FUNCTION IF EXISTS create_invite_secure(UUID, TEXT, user_role, INTEGER);
--
-- =============================================

BEGIN;

-- =============================================
-- STEP 1: Accept Invite RPC (SECURITY DEFINER)
-- =============================================
CREATE OR REPLACE FUNCTION accept_invite_by_code(
  p_token TEXT,
  p_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite RECORD;
  v_user_id UUID;
  v_user_email TEXT;
  v_school_name TEXT;
  v_result JSONB;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'NOT_AUTHENTICATED',
      'message', 'You must be logged in to accept an invite'
    );
  END IF;
  
  -- Get user email
  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
  
  -- Find invite by token
  SELECT 
    si.*,
    s.name as school_name
  INTO v_invite
  FROM school_invites si
  JOIN schools s ON s.id = si.school_id
  WHERE si.token = p_token;
  
  IF v_invite IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'INVALID_TOKEN',
      'message', 'This invite link is invalid or does not exist'
    );
  END IF;
  
  -- Check if already accepted
  IF v_invite.status = 'accepted' THEN
    RETURN jsonb_build_object(
      'status', 'ALREADY_ACCEPTED',
      'message', 'This invite has already been used'
    );
  END IF;
  
  -- Check if revoked
  IF v_invite.status = 'revoked' THEN
    RETURN jsonb_build_object(
      'status', 'INVALID_TOKEN',
      'message', 'This invite has been revoked'
    );
  END IF;
  
  -- Check if expired
  IF v_invite.expires_at < NOW() OR v_invite.status = 'expired' THEN
    -- Update status to expired if not already
    UPDATE school_invites SET status = 'expired' WHERE id = v_invite.id AND status != 'expired';
    
    RETURN jsonb_build_object(
      'status', 'EXPIRED',
      'message', 'This invite has expired. Please request a new one.'
    );
  END IF;
  
  -- Validate security code (case-insensitive comparison)
  IF UPPER(v_invite.security_code) != UPPER(p_code) THEN
    RETURN jsonb_build_object(
      'status', 'INVALID_CODE',
      'message', 'The security code is incorrect. Please check and try again.'
    );
  END IF;
  
  -- All validations passed - perform atomic insert/update
  
  -- Insert or update school_members
  INSERT INTO school_members (
    school_id,
    user_id,
    role,
    invited_by,
    is_active,
    joined_at
  )
  VALUES (
    v_invite.school_id,
    v_user_id,
    v_invite.role,
    v_invite.invited_by,
    true,
    NOW()
  )
  ON CONFLICT (school_id, user_id) DO UPDATE SET
    role = EXCLUDED.role,
    is_active = true,
    updated_at = NOW();
  
  -- Update invite status
  UPDATE school_invites SET
    status = 'accepted',
    accepted_at = NOW(),
    accepted_by = v_user_id
  WHERE id = v_invite.id;
  
  -- Insert audit log (never include security_code)
  INSERT INTO invite_audit (invite_id, action, actor_id, meta)
  VALUES (
    v_invite.id,
    'ACCEPTED',
    v_user_id,
    jsonb_build_object(
      'school_id', v_invite.school_id,
      'role', v_invite.role,
      'email', v_invite.email,
      'accepted_email', v_user_email
    )
  );
  
  -- Return success
  RETURN jsonb_build_object(
    'status', 'SUCCESS',
    'role', v_invite.role,
    'school_id', v_invite.school_id,
    'school_name', v_invite.school_name,
    'message', 'Welcome! You have successfully joined ' || v_invite.school_name
  );
  
EXCEPTION WHEN OTHERS THEN
  -- Log error and return generic message
  RAISE WARNING 'accept_invite_by_code error: %', SQLERRM;
  RETURN jsonb_build_object(
    'status', 'ERROR',
    'message', 'An unexpected error occurred. Please try again.'
  );
END;
$$;

-- =============================================
-- STEP 2: Create Invite Secure Function
-- =============================================
CREATE OR REPLACE FUNCTION create_invite_secure(
  p_school_id UUID,
  p_email TEXT,
  p_role user_role,
  p_expires_hours INTEGER DEFAULT 168
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token TEXT;
  v_code TEXT;
  v_invite_id UUID;
  v_expires_at TIMESTAMPTZ;
  v_user_id UUID;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'NOT_AUTHENTICATED',
      'message', 'You must be logged in to create invites'
    );
  END IF;
  
  -- Check if user is principal of this school
  IF NOT is_school_principal(p_school_id) THEN
    RETURN jsonb_build_object(
      'status', 'FORBIDDEN',
      'message', 'Only principals can invite members'
    );
  END IF;
  
  -- Check if user is already a member
  IF EXISTS (
    SELECT 1 FROM school_members sm
    JOIN auth.users u ON u.id = sm.user_id
    WHERE sm.school_id = p_school_id 
    AND LOWER(u.email) = LOWER(p_email)
    AND sm.is_active = true
  ) THEN
    RETURN jsonb_build_object(
      'status', 'ALREADY_MEMBER',
      'message', 'This email is already a member of the school'
    );
  END IF;
  
  -- Check for existing pending invite and revoke it
  UPDATE school_invites 
  SET status = 'revoked'
  WHERE school_id = p_school_id 
  AND LOWER(email) = LOWER(p_email)
  AND status = 'pending';
  
  -- Generate secure token (64 hex chars)
  v_token := encode(gen_random_bytes(32), 'hex');
  
  -- Generate 6-character alphanumeric code (uppercase)
  v_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 6));
  
  -- Set expiration
  v_expires_at := NOW() + (p_expires_hours || ' hours')::INTERVAL;
  
  -- Insert new invite
  INSERT INTO school_invites (
    school_id,
    email,
    role,
    token,
    security_code,
    invited_by,
    expires_at,
    status
  )
  VALUES (
    p_school_id,
    LOWER(p_email),
    p_role,
    v_token,
    v_code,
    v_user_id,
    v_expires_at,
    'pending'
  )
  RETURNING id INTO v_invite_id;
  
  -- Insert audit log (never include security_code)
  INSERT INTO invite_audit (invite_id, action, actor_id, meta)
  VALUES (
    v_invite_id,
    'CREATED',
    v_user_id,
    jsonb_build_object(
      'school_id', p_school_id,
      'role', p_role,
      'email', LOWER(p_email),
      'expires_at', v_expires_at
    )
  );
  
  -- Return success with token and security_code
  -- NOTE: security_code is returned for testing only - remove in production email flow
  RETURN jsonb_build_object(
    'status', 'SUCCESS',
    'invite_id', v_invite_id,
    'token', v_token,
    'security_code', v_code,
    'expires_at', v_expires_at
  );
  
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'create_invite_secure error: %', SQLERRM;
  RETURN jsonb_build_object(
    'status', 'ERROR',
    'message', 'Failed to create invite: ' || SQLERRM
  );
END;
$$;

-- =============================================
-- STEP 3: Get pending invites for admin
-- =============================================
CREATE OR REPLACE FUNCTION get_school_invites_secure(p_school_id UUID)
RETURNS TABLE (
  id UUID,
  email TEXT,
  role user_role,
  status invite_status,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  accepted_by UUID
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT 
    si.id,
    si.email,
    si.role,
    si.status,
    si.expires_at,
    si.created_at,
    si.accepted_at,
    si.accepted_by
  FROM school_invites si
  WHERE si.school_id = p_school_id
  AND is_school_principal(p_school_id)
  ORDER BY 
    CASE si.status 
      WHEN 'pending' THEN 0 
      WHEN 'accepted' THEN 1 
      ELSE 2 
    END,
    si.created_at DESC
$$;

-- =============================================
-- STEP 4: Revoke invite function
-- =============================================
CREATE OR REPLACE FUNCTION revoke_invite_secure(p_invite_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id UUID;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('status', 'NOT_AUTHENTICATED');
  END IF;
  
  -- Get school_id for the invite
  SELECT school_id INTO v_school_id 
  FROM school_invites 
  WHERE id = p_invite_id;
  
  IF v_school_id IS NULL THEN
    RETURN jsonb_build_object('status', 'NOT_FOUND');
  END IF;
  
  -- Check permission
  IF NOT is_school_principal(v_school_id) THEN
    RETURN jsonb_build_object('status', 'FORBIDDEN');
  END IF;
  
  -- Update status
  UPDATE school_invites 
  SET status = 'revoked'
  WHERE id = p_invite_id AND status = 'pending';
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'NOT_FOUND', 'message', 'Invite not found or already processed');
  END IF;
  
  -- Audit
  INSERT INTO invite_audit (invite_id, action, actor_id, meta)
  VALUES (p_invite_id, 'REVOKED', v_user_id, jsonb_build_object('school_id', v_school_id));
  
  RETURN jsonb_build_object('status', 'SUCCESS');
END;
$$;

-- =============================================
-- STEP 5: Grants
-- =============================================
GRANT EXECUTE ON FUNCTION accept_invite_by_code TO authenticated;
GRANT EXECUTE ON FUNCTION create_invite_secure TO authenticated;
GRANT EXECUTE ON FUNCTION get_school_invites_secure TO authenticated;
GRANT EXECUTE ON FUNCTION revoke_invite_secure TO authenticated;

COMMIT;
