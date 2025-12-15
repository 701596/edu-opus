-- =============================================
-- RPC: Get School Activity & Invite Info
-- Description: Returns active status and invite codes for school members, linked by email
-- =============================================

CREATE OR REPLACE FUNCTION public.get_school_activity(p_school_id UUID)
RETURNS TABLE (
    email TEXT,
    last_active_at TIMESTAMPTZ,
    invite_used_code TEXT,
    invite_used_type TEXT,
    role user_role
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        au.email,
        sm.last_active_at,
        sm.invite_used_code,
        sm.invite_used_type,
        sm.role
    FROM public.school_members sm
    JOIN auth.users au ON sm.user_id = au.id
    WHERE sm.school_id = p_school_id;
END;
$$;
