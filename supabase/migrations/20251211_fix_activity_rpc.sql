-- =============================================
-- REPAIR: Staff Activity RPC - Switch to JSONB
-- Description: Returns JSONB to avoid type mapping issues with Supabase Client
-- =============================================

DROP FUNCTION IF EXISTS public.get_school_activity(UUID);

CREATE OR REPLACE FUNCTION public.get_school_activity(p_school_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_agg(
        jsonb_build_object(
            'email', au.email,
            'last_active_at', sm.last_active_at,
            'invite_used_code', sm.invite_used_code,
            'invite_used_type', sm.invite_used_type,
            'role', sm.role
        )
    )
    INTO result
    FROM public.school_members sm
    JOIN auth.users au ON sm.user_id = au.id
    WHERE sm.school_id = p_school_id;

    -- Return empty array if null
    RETURN COALESCE(result, '[]'::jsonb);
END;
$$;
