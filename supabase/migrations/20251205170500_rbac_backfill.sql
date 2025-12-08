-- =============================================
-- MIGRATION: RBAC Backfill Existing Data
-- Version: 1.0.0
-- PR: rbac/2025_add_school_members_and_roles
-- =============================================
-- Migrates existing user_id data to school_id
-- NON-DESTRUCTIVE: Creates schools for existing users
-- =============================================

BEGIN;

-- =============================================
-- STEP 1: Create schools for existing users
-- =============================================
-- Each existing user gets their own school (they become principal)

INSERT INTO schools (name, owner_id, code, created_at)
SELECT 
  COALESCE(
    (SELECT name FROM students WHERE user_id = u.id LIMIT 1),
    'My School'
  ) || ' School' AS name,
  u.id AS owner_id,
  UPPER(SUBSTRING(MD5(u.id::TEXT) FROM 1 FOR 8)) AS code,
  COALESCE(u.created_at, NOW()) AS created_at
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM schools s WHERE s.owner_id = u.id
)
AND EXISTS (
  -- Only for users who have data
  SELECT 1 FROM students st WHERE st.user_id = u.id
  UNION
  SELECT 1 FROM payments p WHERE p.user_id = u.id
  UNION
  SELECT 1 FROM expenses e WHERE e.user_id = u.id
);

-- =============================================
-- STEP 2: Backfill school_id in students
-- =============================================
UPDATE students
SET school_id = (SELECT id FROM schools WHERE owner_id = students.user_id LIMIT 1)
WHERE school_id IS NULL AND user_id IS NOT NULL;

-- =============================================
-- STEP 3: Backfill school_id in payments
-- =============================================
UPDATE payments
SET school_id = (SELECT id FROM schools WHERE owner_id = payments.user_id LIMIT 1)
WHERE school_id IS NULL AND user_id IS NOT NULL;

-- =============================================
-- STEP 4: Backfill school_id in expenses
-- =============================================
UPDATE expenses
SET school_id = (SELECT id FROM schools WHERE owner_id = expenses.user_id LIMIT 1)
WHERE school_id IS NULL AND user_id IS NOT NULL;

-- =============================================
-- STEP 5: Backfill school_id in staff
-- =============================================
UPDATE staff
SET school_id = (SELECT id FROM schools WHERE owner_id = staff.user_id LIMIT 1)
WHERE school_id IS NULL AND user_id IS NOT NULL;

-- =============================================
-- STEP 6: Backfill school_id in monthly_reports
-- =============================================
UPDATE monthly_reports
SET school_id = (SELECT id FROM schools WHERE owner_id = monthly_reports.user_id LIMIT 1)
WHERE school_id IS NULL AND user_id IS NOT NULL;

-- =============================================
-- STEP 7: Verification query (run manually)
-- =============================================
-- Check backfill status:
/*
SELECT 
  'students' AS table_name,
  COUNT(*) AS total,
  COUNT(school_id) AS with_school_id,
  COUNT(*) - COUNT(school_id) AS missing
FROM students
UNION ALL
SELECT 
  'payments',
  COUNT(*),
  COUNT(school_id),
  COUNT(*) - COUNT(school_id)
FROM payments
UNION ALL
SELECT 
  'expenses',
  COUNT(*),
  COUNT(school_id),
  COUNT(*) - COUNT(school_id)
FROM expenses
UNION ALL
SELECT 
  'staff',
  COUNT(*),
  COUNT(school_id),
  COUNT(*) - COUNT(school_id)
FROM staff;
*/

-- =============================================
-- STEP 8: Sample rows for verification
-- =============================================
/*
SELECT 
  s.id AS school_id,
  s.name AS school_name,
  s.code,
  sm.role,
  u.email
FROM schools s
JOIN school_members sm ON sm.school_id = s.id
JOIN auth.users u ON u.id = sm.user_id
LIMIT 10;
*/

COMMIT;
