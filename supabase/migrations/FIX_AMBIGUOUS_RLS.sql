-- Fix ambiguous column references in RLS policies

-- 1. Fix schools_select
DROP POLICY IF EXISTS schools_select ON schools;
CREATE POLICY schools_select ON schools FOR SELECT
USING (
  id IN (SELECT sm.school_id FROM school_members sm WHERE sm.user_id = auth.uid() AND sm.is_active = true)
  OR owner_id = auth.uid()
);

-- 2. Fix school_members_select
DROP POLICY IF EXISTS school_members_select ON school_members;
CREATE POLICY school_members_select ON school_members FOR SELECT
USING (
  school_id IN (SELECT sm.school_id FROM school_members sm WHERE sm.user_id = auth.uid())
);

-- 3. Fix school_members_insert (just in case)
DROP POLICY IF EXISTS school_members_insert ON school_members;
CREATE POLICY school_members_insert ON school_members FOR INSERT
WITH CHECK (
  is_school_principal(school_id) 
  OR EXISTS (SELECT 1 FROM schools s WHERE s.id = school_id AND s.owner_id = auth.uid())
);
