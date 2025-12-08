-- =============================================
-- Invite Token Lookup Function
-- Add this RPC to support the AcceptInvite page
-- =============================================

-- Function to get invite details by token (public access)
CREATE OR REPLACE FUNCTION public.get_invite_by_token(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invite RECORD;
  v_result JSON;
BEGIN
  SELECT 
    si.id,
    si.email,
    si.role::TEXT,
    s.name as school_name,
    si.school_id,
    si.expires_at,
    si.created_at,
    CASE 
      WHEN si.used_at IS NOT NULL THEN false
      WHEN si.expires_at < NOW() THEN false
      ELSE true
    END as is_valid
  INTO v_invite
  FROM school_invites si
  JOIN schools s ON s.id = si.school_id
  WHERE si.token = p_token;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  RETURN json_build_object(
    'id', v_invite.id,
    'email', v_invite.email,
    'role', v_invite.role,
    'school_name', v_invite.school_name,
    'school_id', v_invite.school_id,
    'expires_at', v_invite.expires_at,
    'created_at', v_invite.created_at,
    'is_valid', v_invite.is_valid
  );
END;
$$;

-- Grant execute to anonymous users (invite links are public)
GRANT EXECUTE ON FUNCTION public.get_invite_by_token TO anon;
GRANT EXECUTE ON FUNCTION public.get_invite_by_token TO authenticated;
