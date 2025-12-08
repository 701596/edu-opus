-- Fix for "column reference 'security_code' is ambiguous" error
-- This explicitly changes the lateral join to use aliased columns

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
SECURITY DEFINER
AS $$
BEGIN
    -- Verify principal access
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
    -- LEFT JOIN LATERAL to find the code associated with this email
    -- Explicitly using si_inner alias to avoid ambiguity if other tables have security_code
    LEFT JOIN LATERAL (
        SELECT si_inner.security_code, si_inner.expires_at
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

GRANT EXECUTE ON FUNCTION get_school_members_extended TO authenticated;
