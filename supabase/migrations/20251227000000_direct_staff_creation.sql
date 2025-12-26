-- ============================================================================
-- Migration: Direct Staff Creation & Cleanup
-- Created: 2025-12-27
-- ============================================================================

-- 1. Ensure profiles has full_name
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT;

-- 2. Drop obsolete invite system
DROP TABLE IF EXISTS public.staff_invites CASCADE;
DROP FUNCTION IF EXISTS public.accept_staff_invite();
DROP FUNCTION IF EXISTS public.get_pending_invite();
DROP FUNCTION IF EXISTS public.send_staff_invite(jsonb); -- Edge function usually not in DB but good to cleanup if any wrapper

-- 3. Update Trigger to skip school creation if created_by_admin
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
  -- SKIP if user is created by admin (Staff creation flow)
  IF (new.raw_user_meta_data->>'created_by_admin')::boolean = true THEN
    RETURN new;
  END IF;

  -- Idempotency Check: If user is already a member of ANY school, exit.
  IF EXISTS (SELECT 1 FROM public.school_members WHERE user_id = new.id) THEN
    RETURN new;
  END IF;

  -- Determine School Name (Metadata 'full_name' or default 'My')
  user_full_name := COALESCE(new.raw_user_meta_data->>'full_name', 'My');

  -- Create School
  INSERT INTO public.schools (name, owner_id)
  VALUES (user_full_name || '''s School', new.id)
  RETURNING id INTO new_school_id;

  -- Upsert Profile
  INSERT INTO public.profiles (id, school_id, role, full_name)
  VALUES (new.id, new_school_id, 'principal', user_full_name)
  ON CONFLICT (id) DO UPDATE
  SET school_id = EXCLUDED.school_id,
      role = EXCLUDED.role,
      full_name = EXCLUDED.full_name
  WHERE profiles.school_id IS NULL;

  RETURN new;
EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$;

-- 4. Create Helper RPC for Admin Staff List
-- Returns list of staff for a given school (must be principal)
CREATE OR REPLACE FUNCTION public.get_staff_list(p_school_id UUID)
RETURNS TABLE (
  user_id UUID,
  full_name TEXT,
  email TEXT,
  role TEXT,
  joined_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is principal of this school
  IF NOT EXISTS (
    SELECT 1 FROM public.school_members 
    WHERE user_id = auth.uid() 
    AND school_id = p_school_id 
    AND role = 'principal'
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT 
    sm.user_id,
    COALESCE(p.full_name, 'Unknown'),
    au.email::TEXT,
    sm.role::TEXT,
    sm.joined_at
  FROM public.school_members sm
  JOIN auth.users au ON au.id = sm.user_id
  LEFT JOIN public.profiles p ON p.id = sm.user_id
  WHERE sm.school_id = p_school_id
  ORDER BY sm.joined_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_staff_list(UUID) TO authenticated;
