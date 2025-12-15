-- =============================================
-- MIGRATION: Fix school_members RLS Infinite Recursion
-- Version: 1.0.0
-- Date: 2025-12-09
-- =============================================
-- 
-- FIX: The school_members_select policy had infinite recursion:
--   school_id IN (SELECT school_id FROM school_members WHERE user_id = auth.uid())
-- This causes Postgres to call the same policy when executing the subquery.
-- 
-- SOLUTION: Use user_id = auth.uid() directly for own rows,
-- and use is_school_principal() (which is SECURITY DEFINER) for same-school access.
--
-- ROLLBACK: Re-run the original policy from 20251205170000_rbac_core.sql
-- =============================================

BEGIN;

-- =============================================
-- Drop and recreate school_members RLS policies
-- =============================================

DROP POLICY IF EXISTS school_members_select ON school_members;
DROP POLICY IF EXISTS school_members_insert ON school_members;
DROP POLICY IF EXISTS school_members_update ON school_members;
DROP POLICY IF EXISTS school_members_delete ON school_members;

-- FIX: Users can see their own membership rows
-- Other memberships are accessible via SECURITY DEFINER functions
CREATE POLICY school_members_select ON school_members FOR SELECT
USING (
  -- User can always see their own membership
  user_id = auth.uid()
);

-- Only principal can add members (uses SECURITY DEFINER function - no recursion)
CREATE POLICY school_members_insert ON school_members FOR INSERT
WITH CHECK (
  is_school_principal(school_id) 
  OR EXISTS (SELECT 1 FROM schools WHERE id = school_id AND owner_id = auth.uid())
);

-- Only principal can update members (except self)
CREATE POLICY school_members_update ON school_members FOR UPDATE
USING (
  is_school_principal(school_id) AND user_id != auth.uid()
);

-- Only principal can remove members
CREATE POLICY school_members_delete ON school_members FOR DELETE
USING (is_school_principal(school_id));

-- =============================================
-- Create a SECURITY DEFINER function to get all members of a school
-- This bypasses RLS for authorized principals
-- =============================================
CREATE OR REPLACE FUNCTION get_school_members(p_school_id UUID)
RETURNS TABLE (
  member_id UUID,
  user_id UUID,
  role user_role,
  is_active BOOLEAN,
  joined_at TIMESTAMPTZ,
  email TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  -- Check if caller is a member of this school
  IF NOT EXISTS (
    SELECT 1 FROM school_members sm 
    WHERE sm.school_id = p_school_id 
    AND sm.user_id = auth.uid() 
    AND sm.is_active = true
  ) THEN
    RETURN; -- Return empty if not authorized
  END IF;
  
  RETURN QUERY
  SELECT 
    sm.id as member_id,
    sm.user_id,
    sm.role,
    sm.is_active,
    sm.joined_at,
    u.email
  FROM school_members sm
  LEFT JOIN auth.users u ON u.id = sm.user_id
  WHERE sm.school_id = p_school_id
  ORDER BY sm.role, sm.joined_at;
END;
$$;

GRANT EXECUTE ON FUNCTION get_school_members TO authenticated;

COMMIT;
