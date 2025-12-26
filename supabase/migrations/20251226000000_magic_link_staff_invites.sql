-- ============================================================================
-- Migration: Magic Link Staff Invite System
-- Created: 2025-12-26
-- 
-- This migration:
-- 1. Creates staff_invites table for magic link invitations
-- 2. Modifies auto-school trigger to skip for invited users
-- ============================================================================

-- ============================================================================
-- STEP 1: Create staff_invites table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.staff_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('teacher', 'finance', 'admin')),
  invited_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '7 days'),
  used_at TIMESTAMPTZ
);

-- Index for quick lookups by email (used in trigger and accept flow)
CREATE INDEX IF NOT EXISTS idx_staff_invites_email ON public.staff_invites(email);
CREATE INDEX IF NOT EXISTS idx_staff_invites_school ON public.staff_invites(school_id);

-- Unique constraint: one active invite per email per school
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_invites_unique_active 
ON public.staff_invites(email, school_id) 
WHERE used_at IS NULL;

-- ============================================================================
-- STEP 2: RLS Policies for staff_invites
-- ============================================================================

ALTER TABLE public.staff_invites ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_invites TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_invites TO service_role;

-- Principals can manage their school's invites
CREATE POLICY "Principals can manage their school invites" ON public.staff_invites
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.school_members sm
      WHERE sm.school_id = staff_invites.school_id
      AND sm.user_id = auth.uid()
      AND sm.role = 'principal'
    )
  );

-- Users can read their own invite by email (for accept flow)
CREATE POLICY "Users can read their own invite" ON public.staff_invites
  FOR SELECT USING (
    email = (auth.jwt() ->> 'email')
    AND used_at IS NULL
    AND expires_at > now()
  );

-- ============================================================================
-- STEP 3: Modify handle_new_user_school_creation trigger
-- Add check to skip school creation for invited users
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user_school_creation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_school_id uuid;
  user_full_name text;
BEGIN
  -- *** NEW: Skip school creation if user has a pending invite ***
  -- This allows invited users to join a school via the invite flow
  -- instead of getting an auto-created school
  IF EXISTS (
    SELECT 1 FROM public.staff_invites
    WHERE email = new.email
    AND used_at IS NULL
    AND expires_at > now()
  ) THEN
    RETURN new; -- Skip school creation, invite flow will handle membership
  END IF;

  -- Idempotency Check: If user is already a member of ANY school, exit.
  IF EXISTS (SELECT 1 FROM public.school_members WHERE user_id = new.id) THEN
    RETURN new;
  END IF;

  -- Determine School Name (Metadata 'full_name' or default 'My')
  user_full_name := COALESCE(new.raw_user_meta_data->>'full_name', 'My');

  -- Create School (on_school_created trigger handles school_members insertion automatically)
  INSERT INTO public.schools (name, owner_id)
  VALUES (user_full_name || '''s School', new.id)
  RETURNING id INTO new_school_id;

  -- NOTE: school_members row is created by on_school_created -> handle_new_school_owner trigger

  -- Upsert Profile
  INSERT INTO public.profiles (id, school_id, role)
  VALUES (new.id, new_school_id, 'principal')
  ON CONFLICT (id) DO UPDATE
  SET school_id = EXCLUDED.school_id,
      role = EXCLUDED.role
  WHERE profiles.school_id IS NULL;

  RETURN new;
EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$;

-- ============================================================================
-- STEP 4: accept_staff_invite RPC
-- Called from frontend to complete invite acceptance
-- ============================================================================

CREATE OR REPLACE FUNCTION public.accept_staff_invite()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite RECORD;
  v_user_email TEXT;
  v_user_id UUID;
  v_school RECORD;
BEGIN
  -- Get current user info
  v_user_id := auth.uid();
  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
  
  IF v_user_email IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;
  
  -- Find pending invite for this email
  SELECT si.*, s.name as school_name 
  INTO v_invite 
  FROM public.staff_invites si
  JOIN public.schools s ON s.id = si.school_id
  WHERE si.email = v_user_email
  AND si.used_at IS NULL
  AND si.expires_at > now()
  ORDER BY si.created_at DESC
  LIMIT 1;
  
  IF v_invite IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No valid invite found');
  END IF;
  
  -- Security: Prevent staff from becoming principal via invite
  IF v_invite.role = 'principal' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid role assignment');
  END IF;
  
  -- Insert into school_members (allow multiple schools)
  INSERT INTO public.school_members (user_id, school_id, role, invited_by, joined_at, invite_used_type)
  VALUES (v_user_id, v_invite.school_id, v_invite.role::user_role, v_invite.invited_by, now(), 'magic_link')
  ON CONFLICT (user_id, school_id) DO UPDATE
    SET role = EXCLUDED.role, 
        joined_at = now(),
        invited_by = EXCLUDED.invited_by,
        invite_used_type = 'magic_link';
  
  -- Mark invite as used
  UPDATE public.staff_invites SET used_at = now() WHERE id = v_invite.id;
  
  -- Upsert Profile (set to this school, can be changed later if user has multiple)
  INSERT INTO public.profiles (id, school_id, role)
  VALUES (v_user_id, v_invite.school_id, v_invite.role::user_role)
  ON CONFLICT (id) DO UPDATE
    SET school_id = EXCLUDED.school_id, 
        role = EXCLUDED.role;
  
  RETURN jsonb_build_object(
    'ok', true,
    'school_id', v_invite.school_id,
    'school_name', v_invite.school_name,
    'role', v_invite.role
  );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.accept_staff_invite() TO authenticated;

-- ============================================================================
-- STEP 5: get_pending_invite RPC
-- Called from frontend to fetch invite details for display
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_pending_invite()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_email TEXT;
  v_invite RECORD;
BEGIN
  SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();
  
  IF v_user_email IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  
  SELECT si.*, s.name as school_name 
  INTO v_invite 
  FROM public.staff_invites si
  JOIN public.schools s ON s.id = si.school_id
  WHERE si.email = v_user_email
  AND si.used_at IS NULL
  AND si.expires_at > now()
  ORDER BY si.created_at DESC
  LIMIT 1;
  
  IF v_invite IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  
  RETURN jsonb_build_object(
    'found', true,
    'id', v_invite.id,
    'school_id', v_invite.school_id,
    'school_name', v_invite.school_name,
    'role', v_invite.role,
    'expires_at', v_invite.expires_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pending_invite() TO authenticated;
