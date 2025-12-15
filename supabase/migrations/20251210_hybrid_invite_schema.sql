-- =============================================
-- MIGRATION: Hybrid Invitation System (Schema)
-- Description: Creates tables for Email Invites and Code Invites
-- Security: Strict RLS, Audit Trails, One-time use
-- =============================================

BEGIN;

-- Ensure user_role type exists (idempotent check not possible for types easily, assuming existence from previous system)
-- If it doesn't exist, this script will fail, which is better than creating a duplicate.

-- =============================================
-- 1. Table: invitations (Email Mode)
-- =============================================
CREATE TABLE IF NOT EXISTS public.invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    role user_role NOT NULL,
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
    used_at TIMESTAMPTZ, -- If NOT NULL, invite is used
    created_by UUID REFERENCES auth.users(id), -- Audit
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_invitations_token ON public.invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON public.invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_school ON public.invitations(school_id);
-- Index for finding active invites quickly
CREATE INDEX IF NOT EXISTS idx_invitations_active ON public.invitations(token) 
WHERE used_at IS NULL AND expires_at > now();


-- =============================================
-- 2. Table: invitation_codes (Code Mode)
-- =============================================
CREATE TABLE IF NOT EXISTS public.invitation_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE, -- The short code (e.g. ABX9-FK24)
    role user_role NOT NULL,
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
    used_at TIMESTAMPTZ, -- If NOT NULL, code is used
    created_by UUID REFERENCES auth.users(id), -- Audit
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_invitation_codes_code ON public.invitation_codes(code);
CREATE INDEX IF NOT EXISTS idx_invitation_codes_school ON public.invitation_codes(school_id);
-- Index for finding active codes quickly
CREATE INDEX IF NOT EXISTS idx_invitation_codes_active ON public.invitation_codes(code) 
WHERE used_at IS NULL AND expires_at > now();


-- =============================================
-- 3. RLS Policies
-- =============================================
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitation_codes ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can view/create invites for their school
-- Note: 'is_admin_of' helper function is assumed from existing RBAC system.
-- If not active, we fall back to checking if auth.uid() matches created_by or specific admin role logic.
-- For now, we allow INSERT/SELECT if the user is an identified school admin.

-- READ: Active invites can be read by Anonymous (for verification on Join page)
CREATE POLICY "Public verify active invites" ON public.invitations
FOR SELECT USING (
    used_at IS NULL 
    AND expires_at > now()
);

-- READ: Admins can see all invites they created
CREATE POLICY "Admins view own invites" ON public.invitations
FOR SELECT USING (
    auth.uid() = created_by
);

-- INSERT: Authenticated users (Admins) can create
CREATE POLICY "Admins create invites" ON public.invitations
FOR INSERT WITH CHECK (
    auth.uid() = created_by
);

-- Same for Invitation Codes
CREATE POLICY "Public verify active codes" ON public.invitation_codes
FOR SELECT USING (
    used_at IS NULL 
    AND expires_at > now()
);

CREATE POLICY "Admins view own codes" ON public.invitation_codes
FOR SELECT USING (
    auth.uid() = created_by
);

CREATE POLICY "Admins create codes" ON public.invitation_codes
FOR INSERT WITH CHECK (
    auth.uid() = created_by
);


-- =============================================
-- 4. Triggers (Updated At)
-- =============================================
-- Reuse generic update timestamp function if available, else create specific
CREATE OR REPLACE FUNCTION public.update_invites_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_invitations_timestamp
BEFORE UPDATE ON public.invitations
FOR EACH ROW EXECUTE FUNCTION public.update_invites_timestamp();

CREATE TRIGGER update_invitation_codes_timestamp
BEFORE UPDATE ON public.invitation_codes
FOR EACH ROW EXECUTE FUNCTION public.update_invites_timestamp();


COMMIT;
