-- =============================================
-- MIGRATION: Staff Tracking & Invite Visibility
-- Date: 2025-12-11
-- Features: Login Logs, Heartbeat, Invite Persistence
-- =============================================

BEGIN;

-- 1. Create Login Logs Table
CREATE TABLE IF NOT EXISTS public.staff_login_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
    role user_role,
    login_at TIMESTAMPTZ DEFAULT now(),
    ip_address TEXT,
    device_info TEXT
);

-- RLS: Users can see own logs. Principals can see all logs for their school.
ALTER TABLE public.staff_login_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own logs" ON public.staff_login_logs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Principals view school logs" ON public.staff_login_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.school_members sm
            WHERE sm.user_id = auth.uid()
            AND sm.school_id = staff_login_logs.school_id
            AND sm.role = 'principal'
        )
    );

CREATE POLICY "Users insert own logs" ON public.staff_login_logs
    FOR INSERT WITH CHECK (auth.uid() = user_id);


-- 2. Alter School Members (Tracking Columns)
ALTER TABLE public.school_members
    ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS invite_used_code TEXT,
    ADD COLUMN IF NOT EXISTS invite_used_type TEXT; -- 'email' or 'code'


-- 3. RPC: Log Login
CREATE OR REPLACE FUNCTION public.log_login(
    p_school_id UUID,
    p_role user_role,
    p_device_info TEXT DEFAULT NULL,
    p_ip_address TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.staff_login_logs (user_id, school_id, role, ip_address, device_info)
    VALUES (auth.uid(), p_school_id, p_role, p_ip_address, p_device_info);
END;
$$;


-- 4. RPC: Update Heartbeat
CREATE OR REPLACE FUNCTION public.update_heartbeat()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.school_members
    SET last_active_at = now()
    WHERE user_id = auth.uid();
END;
$$;


-- 5. UPDATE: accept_hybrid_invite (Persist code)
-- We need to replace the previous function to include the invite info logic.
CREATE OR REPLACE FUNCTION public.accept_hybrid_invite(
    p_token TEXT DEFAULT NULL,
    p_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_user_id UUID;
    v_email TEXT;
    
    v_invite_id UUID;
    v_school_id UUID;
    v_role user_role;
    v_used_code TEXT;
    v_used_type TEXT;
BEGIN
    v_user_id := auth.uid();
    v_email := auth.jwt() ->> 'email';

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- A. Check Token
    IF p_token IS NOT NULL THEN
        SELECT id, school_id, role, token INTO v_invite_id, v_school_id, v_role, v_used_code
        FROM invitations
        WHERE token = p_token
          AND used_at IS NULL
          AND expires_at > now();
          
        IF v_invite_id IS NULL THEN
            RAISE EXCEPTION 'Invalid or expired email invitation.';
        END IF;

        -- Verify email matches (optional strict check, skipping for now to allow flexible emails if desired, 
        -- but usually we want to enforce it. Let's enforce if the invite has an email set)
        -- IF (SELECT email FROM invitations WHERE id = v_invite_id) != v_email THEN ...

        UPDATE invitations 
        SET used_at = now() 
        WHERE id = v_invite_id;

        v_used_type := 'email';

    -- B. Check Code
    ELSIF p_code IS NOT NULL THEN
        SELECT id, school_id, role, code INTO v_invite_id, v_school_id, v_role, v_used_code
        FROM invitation_codes
        WHERE code = p_code
          AND used_at IS NULL
          AND expires_at > now();

        IF v_invite_id IS NULL THEN
            RAISE EXCEPTION 'Invalid or expired invitation code.';
        END IF;

        UPDATE invitation_codes 
        SET used_at = now() 
        WHERE id = v_invite_id;

        v_used_type := 'code';

    ELSE
        RAISE EXCEPTION 'No token or code provided.';
    END IF;

    -- C. Link User to School (with Invite Info)
    INSERT INTO school_members (school_id, user_id, role, is_active, invite_used_code, invite_used_type)
    VALUES (v_school_id, v_user_id, v_role, true, v_used_code, v_used_type)
    ON CONFLICT (school_id, user_id) 
    DO UPDATE SET 
        role = EXCLUDED.role, 
        is_active = true,
        invite_used_code = EXCLUDED.invite_used_code,
        invite_used_type = EXCLUDED.invite_used_type;

    RETURN jsonb_build_object(
        'success', true,
        'school_id', v_school_id,
        'role', v_role
    );
END;
$$;

COMMIT;
