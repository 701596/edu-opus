-- Add security_code to school_invites
ALTER TABLE school_invites 
ADD COLUMN IF NOT EXISTS security_code TEXT;

-- Update create_school_invite to generate security code
CREATE OR REPLACE FUNCTION public.create_school_invite(
  p_school_id UUID,
  p_email TEXT,
  p_role user_role,
  p_expires_hours INT DEFAULT 48
)
RETURNS TABLE (
  id UUID,
  token TEXT,
  security_code TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token TEXT;
  v_code TEXT;
  v_id UUID;
BEGIN
  -- Generate secure token for link
  v_token := encode(gen_random_bytes(32), 'hex');
  
  -- Generate user-friendly 6-char security code (uppercase alphanumeric)
  v_code := upper(substring(md5(random()::text) from 1 for 6));
  
  INSERT INTO school_invites (school_id, email, role, token, security_code, expires_at)
  VALUES (
    p_school_id, 
    p_email, 
    p_role, 
    v_token, 
    v_code,
    NOW() + (p_expires_hours || ' hours')::INTERVAL
  )
  RETURNING school_invites.id INTO v_id;
  
  RETURN QUERY SELECT v_id, v_token, v_code;
END;
$$;
