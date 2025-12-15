-- =============================================
-- MIGRATION: Fix RPC Search Paths
-- Description: Updates RPCs to include 'extensions' in search_path so pgcrypto functions work.
-- =============================================

BEGIN;

-- 1. Create Email Invite (Fix search_path)
CREATE OR REPLACE FUNCTION public.create_email_invite(
    p_email TEXT,
    p_role user_role,
    p_school_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_token TEXT;
    v_invite_id UUID;
BEGIN
    -- Authorization
    IF NOT EXISTS (
        SELECT 1 FROM schools WHERE id = p_school_id AND (owner_id = auth.uid() OR id IN (
            SELECT school_id FROM school_members 
            WHERE user_id = auth.uid() AND role = 'principal' AND is_active = true
        ))
    ) THEN
        RAISE EXCEPTION 'Unauthorized: You can only invite to schools you manage.';
    END IF;

    -- Generate Token
    v_token := encode(gen_random_bytes(32), 'hex');

    INSERT INTO invitations (email, role, school_id, token, created_by)
    VALUES (p_email, p_role, p_school_id, v_token, auth.uid())
    RETURNING id INTO v_invite_id;

    RETURN jsonb_build_object('id', v_invite_id, 'token', v_token, 'link', '/join?token=' || v_token);
END;
$$;

-- 2. Create Code Invite (Fix search_path)
CREATE OR REPLACE FUNCTION public.create_code_invite(
    p_role user_role,
    p_school_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_code TEXT;
    v_id UUID;
BEGIN
    -- Authorization
    IF NOT EXISTS (
        SELECT 1 FROM schools WHERE id = p_school_id AND (owner_id = auth.uid() OR id IN (
            SELECT school_id FROM school_members 
            WHERE user_id = auth.uid() AND role = 'principal' AND is_active = true
        ))
    ) THEN
        RAISE EXCEPTION 'Unauthorized: You can only invite to schools you manage.';
    END IF;

    -- Generate Code
    v_code := upper(substring(md5(random()::text) from 1 for 4)) || '-' || upper(substring(md5(random()::text) from 1 for 4));

    INSERT INTO invitation_codes (code, role, school_id, created_by)
    VALUES (v_code, p_role, p_school_id, auth.uid())
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('id', v_id, 'code', v_code);
END;
$$;

-- 3. Verify Invite (Fix search_path)
CREATE OR REPLACE FUNCTION public.verify_hybrid_invite(
    p_token TEXT DEFAULT NULL,
    p_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_result JSONB;
BEGIN
    -- Token Check
    IF p_token IS NOT NULL THEN
        SELECT jsonb_build_object(
            'valid', true,
            'type', 'email',
            'email', i.email,
            'role', i.role,
            'school_name', s.name,
            'school_id', s.id
        ) INTO v_result
        FROM invitations i
        JOIN schools s ON s.id = i.school_id
        WHERE i.token = p_token AND i.used_at IS NULL AND i.expires_at > now();
        
    -- Code Check
    ELSIF p_code IS NOT NULL THEN
        SELECT jsonb_build_object(
            'valid', true,
            'type', 'code',
            'role', ic.role,
            'school_name', s.name,
            'school_id', s.id
        ) INTO v_result
        FROM invitation_codes ic
        JOIN schools s ON s.id = ic.school_id
        WHERE ic.code = p_code AND ic.used_at IS NULL AND ic.expires_at > now();
    END IF;

    RETURN COALESCE(v_result, jsonb_build_object('valid', false));
END;
$$;

-- 4. Accept Invite (Fix search_path)
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
    v_user_id UUID := auth.uid();
    v_school_id UUID;
    v_role user_role;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Validate & Consume Token
    IF p_token IS NOT NULL THEN
        SELECT school_id, role INTO v_school_id, v_role
        FROM invitations
        WHERE token = p_token AND used_at IS NULL AND expires_at > now()
        FOR UPDATE; 

        IF v_school_id IS NULL THEN
            RAISE EXCEPTION 'Invalid or expired invite token';
        END IF;

        UPDATE invitations SET used_at = now() WHERE token = p_token;

    -- Validate & Consume Code
    ELSIF p_code IS NOT NULL THEN
        SELECT school_id, role INTO v_school_id, v_role
        FROM invitation_codes
        WHERE code = p_code AND used_at IS NULL AND expires_at > now()
        FOR UPDATE;

        IF v_school_id IS NULL THEN
             RAISE EXCEPTION 'Invalid or expired invite code';
        END IF;

        UPDATE invitation_codes SET used_at = now() WHERE code = p_code;
    
    ELSE
        RAISE EXCEPTION 'No token or code provided';
    END IF;

    -- Add to School Members
    INSERT INTO school_members (school_id, user_id, role, is_active)
    VALUES (v_school_id, v_user_id, v_role, true)
    ON CONFLICT (school_id, user_id) 
    DO UPDATE SET role = v_role, is_active = true;

    RETURN jsonb_build_object(
        'success', true,
        'school_id', v_school_id,
        'role', v_role
    );
END;
$$;

COMMIT;
