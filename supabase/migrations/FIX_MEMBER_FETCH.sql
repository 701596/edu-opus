-- RPC: Get School Members with Details (Email + Security Code)
-- Solves the issue of joining auth.users and finding the code.
CREATE OR REPLACE FUNCTION get_school_members_extended(p_school_id UUID)
RETURNS TABLE (
    member_id UUID,
    user_id UUID,
    role user_role,
    is_active BOOLEAN,
    joined_at TIMESTAMPTZ,
    email TEXT,
    security_code TEXT,
    code_expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER -- Essential to access auth.users and school_invites fully
AS $$
BEGIN
    IF NOT is_school_principal(p_school_id) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    RETURN QUERY
    SELECT 
        sm.id as member_id,
        sm.user_id,
        sm.role,
        sm.is_active,
        sm.joined_at,
        au.email::TEXT,
        si.security_code,
        si.expires_at as code_expires_at
    FROM school_members sm
    JOIN auth.users au ON sm.user_id = au.id
    -- Left join invites to find the code associated with this email
    -- We match on LOWER(email) just to be safe, and school_id
    -- We pick the most recent invite if multiple exist (LIMIT 1 logic or lateral join?)
    LEFT JOIN LATERAL (
        SELECT security_code, expires_at
        FROM school_invites si_inner
        WHERE LOWER(si_inner.email) = LOWER(au.email)
          AND si_inner.school_id = p_school_id
        ORDER BY si_inner.created_at DESC
        LIMIT 1
    ) si ON true
    WHERE sm.school_id = p_school_id
    ORDER BY sm.joined_at DESC;
END;
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION get_school_members_extended TO authenticated;


-- RPC: Deactivate Security Code (by clearing it or marking invite invalid)
-- User wants to "delete staff deactivate code"
-- We'll just set the security_code to NULL for the invite matching the email? 
-- Or easier: pass the member_id, find the email, then update invite.
CREATE OR REPLACE FUNCTION deactivate_member_code(p_member_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_school_id UUID;
    v_email TEXT;
BEGIN
    SELECT school_id, user_id INTO v_school_id FROM school_members WHERE id = p_member_id;
    
    IF NOT is_school_principal(v_school_id) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    -- Get email
    SELECT email INTO v_email FROM auth.users WHERE id = (SELECT user_id FROM school_members WHERE id = p_member_id);

    -- Update invites
    UPDATE school_invites
    SET security_code = NULL, expires_at = NOW()
    WHERE school_id = v_school_id 
      AND LOWER(email) = LOWER(v_email);
      
    RETURN FOUND;
END;
$$;
GRANT EXECUTE ON FUNCTION deactivate_member_code TO authenticated;
