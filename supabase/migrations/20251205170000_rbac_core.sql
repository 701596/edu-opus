-- =============================================
-- MIGRATION: RBAC Core - Schools, Roles, Members
-- Version: 1.0.0
-- PR: rbac/2025_add_school_members_and_roles
-- =============================================
-- IDEMPOTENT: Safe to run multiple times
-- NON-DESTRUCTIVE: Preserves existing user_id columns
-- =============================================

BEGIN;

-- =============================================
-- STEP 1: Create user_role enum (if not exists)
-- =============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('principal', 'accountant', 'cashier', 'teacher');
  END IF;
END$$;

-- =============================================
-- STEP 2: Create schools table
-- =============================================
CREATE TABLE IF NOT EXISTS schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE, -- Short code for invites (e.g., "SAINTMARYS")
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for owner lookup
CREATE INDEX IF NOT EXISTS idx_schools_owner_id ON schools(owner_id);

-- =============================================
-- STEP 3: Create school_members table
-- =============================================
CREATE TABLE IF NOT EXISTS school_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'teacher',
  is_active BOOLEAN DEFAULT true,
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(school_id, user_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_school_members_school_id ON school_members(school_id);
CREATE INDEX IF NOT EXISTS idx_school_members_user_id ON school_members(user_id);
CREATE INDEX IF NOT EXISTS idx_school_members_role ON school_members(role);

-- =============================================
-- STEP 4: RLS Helper Functions
-- =============================================

-- Get user's school_id (first one if multiple)
CREATE OR REPLACE FUNCTION get_user_school_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT school_id FROM school_members 
  WHERE user_id = auth.uid() AND is_active = true
  LIMIT 1
$$;

-- Get user's role in a specific school
CREATE OR REPLACE FUNCTION get_user_role(p_school_id UUID)
RETURNS user_role
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM school_members 
  WHERE school_id = p_school_id AND user_id = auth.uid() AND is_active = true
$$;

-- Check if user has any of the specified roles
CREATE OR REPLACE FUNCTION has_role(p_school_id UUID, p_roles user_role[])
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM school_members 
    WHERE school_id = p_school_id 
    AND user_id = auth.uid() 
    AND is_active = true
    AND role = ANY(p_roles)
  )
$$;

-- Check if user is principal of any school
CREATE OR REPLACE FUNCTION is_principal()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM school_members 
    WHERE user_id = auth.uid() 
    AND is_active = true
    AND role = 'principal'
  )
$$;

-- Check if user is principal of a specific school
CREATE OR REPLACE FUNCTION is_school_principal(p_school_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM school_members 
    WHERE school_id = p_school_id 
    AND user_id = auth.uid() 
    AND is_active = true
    AND role = 'principal'
  )
$$;

-- Get user's roles as array
CREATE OR REPLACE FUNCTION get_user_roles()
RETURNS TABLE(school_id UUID, school_name TEXT, role user_role)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT sm.school_id, s.name, sm.role
  FROM school_members sm
  JOIN schools s ON s.id = sm.school_id
  WHERE sm.user_id = auth.uid() AND sm.is_active = true
$$;

-- =============================================
-- STEP 5: RLS for schools table
-- =============================================
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;

-- Drop existing policies (idempotent)
DROP POLICY IF EXISTS schools_select ON schools;
DROP POLICY IF EXISTS schools_insert ON schools;
DROP POLICY IF EXISTS schools_update ON schools;
DROP POLICY IF EXISTS schools_delete ON schools;

-- Users can see schools they're members of
CREATE POLICY schools_select ON schools FOR SELECT
USING (
  id IN (SELECT school_id FROM school_members WHERE user_id = auth.uid() AND is_active = true)
  OR owner_id = auth.uid()
);

-- Anyone authenticated can create a school (becomes principal)
CREATE POLICY schools_insert ON schools FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Only principal can update school
CREATE POLICY schools_update ON schools FOR UPDATE
USING (is_school_principal(id));

-- Only principal can delete school
CREATE POLICY schools_delete ON schools FOR DELETE
USING (is_school_principal(id));

-- =============================================
-- STEP 6: RLS for school_members table
-- =============================================
ALTER TABLE school_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS school_members_select ON school_members;
DROP POLICY IF EXISTS school_members_insert ON school_members;
DROP POLICY IF EXISTS school_members_update ON school_members;
DROP POLICY IF EXISTS school_members_delete ON school_members;

-- Members can see other members of their school
CREATE POLICY school_members_select ON school_members FOR SELECT
USING (
  school_id IN (SELECT school_id FROM school_members WHERE user_id = auth.uid())
);

-- Only principal can add members (or owner creating first member)
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
-- STEP 7: Trigger to auto-add principal on school create
-- =============================================
CREATE OR REPLACE FUNCTION auto_add_principal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO school_members (school_id, user_id, role, is_active)
  VALUES (NEW.id, NEW.owner_id, 'principal', true)
  ON CONFLICT (school_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_add_principal ON schools;
CREATE TRIGGER trg_auto_add_principal
AFTER INSERT ON schools
FOR EACH ROW
EXECUTE FUNCTION auto_add_principal();

-- =============================================
-- STEP 8: Grants
-- =============================================
GRANT USAGE ON TYPE user_role TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON schools TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON school_members TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_school_id TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_role TO authenticated;
GRANT EXECUTE ON FUNCTION has_role TO authenticated;
GRANT EXECUTE ON FUNCTION is_principal TO authenticated;
GRANT EXECUTE ON FUNCTION is_school_principal TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_roles TO authenticated;

COMMIT;

-- =============================================
-- VERIFICATION
-- =============================================
-- After applying, run:
-- SELECT * FROM schools;
-- SELECT * FROM school_members;
-- SELECT get_user_roles();
