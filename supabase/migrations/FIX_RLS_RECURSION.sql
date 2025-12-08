-- =============================================
-- NUCLEAR OPTION: Disable RLS on school_members temporarily
-- Then recreate with self-referencing query
-- =============================================

-- Step 1: Disable RLS entirely on school_members
ALTER TABLE school_members DISABLE ROW LEVEL SECURITY;

-- Step 2: Re-enable it
ALTER TABLE school_members ENABLE ROW LEVEL SECURITY;

-- Step 3: Drop ALL policies
DROP POLICY IF EXISTS school_members_select ON school_members;
DROP POLICY IF EXISTS school_members_insert ON school_members;  
DROP POLICY IF EXISTS school_members_update ON school_members;
DROP POLICY IF EXISTS school_members_delete ON school_members;

-- Step 4: Create the simplest possible SELECT policy (users can only see themselves)
CREATE POLICY school_members_select ON school_members FOR SELECT
USING (user_id = auth.uid());

-- Step 5: INSERT - principals or school owners only
CREATE POLICY school_members_insert ON school_members FOR INSERT
WITH CHECK (
  -- Check if user is already a principal in this school
  EXISTS (
    SELECT 1 FROM school_members sm2
    WHERE sm2.school_id = school_id
    AND sm2.user_id = auth.uid()
    AND sm2.role = 'principal'
    AND sm2.is_active = true
  )
  OR
  -- OR this is the school owner
  EXISTS (
    SELECT 1 FROM schools s
    WHERE s.id = school_id
    AND s.owner_id = auth.uid()
  )
);

-- Step 6: UPDATE - principals only
CREATE POLICY school_members_update ON school_members FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM school_members sm2
    WHERE sm2.school_id = school_id
    AND sm2.user_id = auth.uid()
    AND sm2.role = 'principal'
    AND sm2.is_active = true
  )
);

-- Step 7: DELETE - principals only
CREATE POLICY school_members_delete ON school_members FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM school_members sm2
    WHERE sm2.school_id = school_id
    AND sm2.user_id = auth.uid()
    AND sm2.role = 'principal'
    AND sm2.is_active = true
  )
);

-- Verify
SELECT tablename, policyname FROM pg_policies WHERE tablename = 'school_members';
