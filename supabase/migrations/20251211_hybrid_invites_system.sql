-- =============================================
-- MIGRATION: Hybrid Invitation System (Consolidated)
-- Date: 2025-12-11
-- Description: Enables pgcrypto, creates tables, RPCs, RLS, and Grants for efficient and secure invitations.
-- =============================================

BEGIN;

-- 1. Extension: Required for gen_random_bytes
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Cleanup: Safe drops to ensure clean state if re-running
DROP FUNCTION IF EXISTS public.verify_hybrid_invite(text, text);
DROP FUNCTION IF EXISTS public.accept_hybrid_invite(text, text);
DROP FUNCTION IF EXISTS public.create_email_invite(text, user_role, uuid);
DROP FUNCTION IF EXISTS public.create_code_invite(user_role, uuid);
DROP TABLE IF EXISTS public.invitations CASCADE;
DROP TABLE IF EXISTS public.invitation_codes CASCADE;

-- 3. Table: invitations (Email Mode)
CREATE TABLE public.invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    role user_role NOT NULL,
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
    used_at TIMESTAMPTZ, -- Null = Active
    created_by UUID REFERENCES auth.users(id), -- Audit
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Table: invitation_codes (Manual Mode)
CREATE TABLE public.invitation_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    role user_role NOT NULL,
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
    used_at TIMESTAMPTZ, -- Null = Active
    created_by UUID REFERENCES auth.users(id), -- Audit
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Indexes
CREATE INDEX idx_invitations_token ON public.invitations(token);
CREATE INDEX idx_invitations_school ON public.invitations(school_id);

CREATE INDEX idx_invitation_codes_code ON public.invitation_codes(code);
CREATE INDEX idx_invitation_codes_school ON public.invitation_codes(school_id);

-- 6. RLS Policies
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitation_codes ENABLE ROW LEVEL SECURITY;

-- Invitations Policies
CREATE POLICY "Admins create invites" ON public.invitations FOR INSERT 
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Admins view own invites" ON public.invitations FOR SELECT
USING (auth.uid() = created_by);

CREATE POLICY "Service Role full access invites" ON public.invitations FOR ALL 
USING ( (select auth.jwt()->>'role') = 'service_role' )
WITH CHECK ( (select auth.jwt()->>'role') = 'service_role' );

CREATE POLICY "Anon verify active invites" ON public.invitations FOR SELECT
USING (used_at IS NULL AND expires_at > now()); 

-- Invitation Codes Policies
CREATE POLICY "Admins create codes" ON public.invitation_codes FOR INSERT 
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Admins view own codes" ON public.invitation_codes FOR SELECT
USING (auth.uid() = created_by);

CREATE POLICY "Service Role full access codes" ON public.invitation_codes FOR ALL 
USING ( (select auth.jwt()->>'role') = 'service_role' )
WITH CHECK ( (select auth.jwt()->>'role') = 'service_role' );

CREATE POLICY "Anon verify active codes" ON public.invitation_codes FOR SELECT
USING (used_at IS NULL AND expires_at > now());


-- 7. RPC: Create Email Invite
CREATE OR REPLACE FUNCTION public.create_email_invite(
    p_email TEXT,
    p_role user_role,
    p_school_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_token TEXT;
    v_invite_id UUID;
BEGIN
    -- Authorization: Check if user manages this school
    IF NOT EXISTS (
        SELECT 1 FROM schools WHERE id = p_school_id AND (owner_id = auth.uid() OR id IN (
            SELECT school_id FROM school_members 
            WHERE user_id = auth.uid() AND role = 'principal' AND is_active = true
        ))
    ) THEN
        RAISE EXCEPTION 'Unauthorized: You can only invite to schools you manage.';
    END IF;

    v_token := encode(gen_random_bytes(32), 'hex');

    INSERT INTO invitations (email, role, school_id, token, created_by)
    VALUES (p_email, p_role, p_school_id, v_token, auth.uid())
    RETURNING id INTO v_invite_id;

    RETURN jsonb_build_object('id', v_invite_id, 'token', v_token, 'link', '/join?token=' || v_token);
END;
$$;


-- 8. RPC: Create Code Invite
CREATE OR REPLACE FUNCTION public.create_code_invite(
    p_role user_role,
    p_school_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

    -- Generate a 9-char code (e.g., ABX9-FK24)
    v_code := upper(substring(md5(random()::text) from 1 for 4)) || '-' || upper(substring(md5(random()::text) from 1 for 4));

    -- We utilize the UNIQUE constraint to fail if code exists. 
    -- In a high-volume system we'd loop, but for invitations this is sufficient.
    INSERT INTO invitation_codes (code, role, school_id, created_by)
    VALUES (v_code, p_role, p_school_id, auth.uid())
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('id', v_id, 'code', v_code);
END;
$$;


-- 9. RPC: Verify Invite (Public)
CREATE OR REPLACE FUNCTION public.verify_hybrid_invite(
    p_token TEXT DEFAULT NULL,
    p_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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


-- 10. RPC: Accept Invite (Auth Only)
CREATE OR REPLACE FUNCTION public.accept_hybrid_invite(
    p_token TEXT DEFAULT NULL,
    p_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
        FOR UPDATE; -- Prevent race conditions

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
    -- Assumes school_members table exists (RBAC core)
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


-- 11. Grants: Permissions for API Access
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON public.invitations TO service_role;
GRANT ALL ON public.invitation_codes TO service_role;

GRANT EXECUTE ON FUNCTION public.verify_hybrid_invite TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.accept_hybrid_invite TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_email_invite TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_code_invite TO authenticated, service_role;


COMMIT;
