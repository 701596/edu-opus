-- =============================================
-- MIGRATION: RBAC RLS Policies for Existing Tables
-- Version: 1.0.0
-- PR: rbac/2025_add_school_members_and_roles
-- =============================================
-- Updates existing tables to work with RBAC
-- NON-DESTRUCTIVE: Adds school_id without removing user_id
-- =============================================

BEGIN;

-- =============================================
-- STEP 1: Add school_id to existing tables (if not exists)
-- =============================================

-- Add school_id to students
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'students' AND column_name = 'school_id'
  ) THEN
    ALTER TABLE students ADD COLUMN school_id UUID REFERENCES schools(id);
    CREATE INDEX idx_students_school_id ON students(school_id);
  END IF;
END$$;

-- Add school_id to payments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payments' AND column_name = 'school_id'
  ) THEN
    ALTER TABLE payments ADD COLUMN school_id UUID REFERENCES schools(id);
    CREATE INDEX idx_payments_school_id ON payments(school_id);
  END IF;
END$$;

-- Add school_id to expenses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'expenses' AND column_name = 'school_id'
  ) THEN
    ALTER TABLE expenses ADD COLUMN school_id UUID REFERENCES schools(id);
    CREATE INDEX idx_expenses_school_id ON expenses(school_id);
  END IF;
END$$;

-- Add school_id to staff
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'staff' AND column_name = 'school_id'
  ) THEN
    ALTER TABLE staff ADD COLUMN school_id UUID REFERENCES schools(id);
    CREATE INDEX idx_staff_school_id ON staff(school_id);
  END IF;
END$$;

-- Add school_id to monthly_reports (if table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'monthly_reports'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'monthly_reports' AND column_name = 'school_id'
    ) THEN
      ALTER TABLE monthly_reports ADD COLUMN school_id UUID REFERENCES schools(id);
      CREATE INDEX idx_monthly_reports_school_id ON monthly_reports(school_id);
    END IF;
  END IF;
END$$;

-- =============================================
-- STEP 2: Feature flag function
-- =============================================
CREATE OR REPLACE FUNCTION use_school_mode()
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT current_setting('app.use_school_mode', true)::boolean
$$;

-- Default: false (backward compatible)
-- Set to true when ready: SET app.use_school_mode = true;

-- =============================================
-- STEP 3: Drop existing RLS policies (to recreate)
-- =============================================

-- Students
DROP POLICY IF EXISTS "Users can view own students" ON students;
DROP POLICY IF EXISTS "Users can create own students" ON students;
DROP POLICY IF EXISTS "Users can update own students" ON students;
DROP POLICY IF EXISTS "Users can delete own students" ON students;
DROP POLICY IF EXISTS students_select ON students;
DROP POLICY IF EXISTS students_insert ON students;
DROP POLICY IF EXISTS students_update ON students;
DROP POLICY IF EXISTS students_delete ON students;

-- Payments
DROP POLICY IF EXISTS "Users can view own payments" ON payments;
DROP POLICY IF EXISTS "Users can create own payments" ON payments;
DROP POLICY IF EXISTS "Users can update own payments" ON payments;
DROP POLICY IF EXISTS "Users can delete own payments" ON payments;
DROP POLICY IF EXISTS payments_select ON payments;
DROP POLICY IF EXISTS payments_insert ON payments;
DROP POLICY IF EXISTS payments_update ON payments;
DROP POLICY IF EXISTS payments_delete ON payments;

-- Expenses
DROP POLICY IF EXISTS "Users can view own expenses" ON expenses;
DROP POLICY IF EXISTS "Users can create own expenses" ON expenses;
DROP POLICY IF EXISTS "Users can update own expenses" ON expenses;
DROP POLICY IF EXISTS "Users can delete own expenses" ON expenses;
DROP POLICY IF EXISTS expenses_select ON expenses;
DROP POLICY IF EXISTS expenses_insert ON expenses;
DROP POLICY IF EXISTS expenses_update ON expenses;
DROP POLICY IF EXISTS expenses_delete ON expenses;

-- Staff
DROP POLICY IF EXISTS "Users can view own staff" ON staff;
DROP POLICY IF EXISTS "Users can create own staff" ON staff;
DROP POLICY IF EXISTS "Users can update own staff" ON staff;
DROP POLICY IF EXISTS "Users can delete own staff" ON staff;
DROP POLICY IF EXISTS staff_select ON staff;
DROP POLICY IF EXISTS staff_insert ON staff;
DROP POLICY IF EXISTS staff_update ON staff;
DROP POLICY IF EXISTS staff_delete ON staff;

-- =============================================
-- STEP 4: New RBAC-aware RLS policies
-- =============================================

-- ===================
-- STUDENTS
-- ===================

-- SELECT: Principal, Accountant, Cashier can view all; Teacher sees own class students
CREATE POLICY students_select ON students FOR SELECT
USING (
  -- Legacy mode: user_id check
  (user_id = auth.uid())
  OR
  -- RBAC mode: role-based
  (school_id IS NOT NULL AND (
    has_role(school_id, ARRAY['principal', 'accountant', 'cashier']::user_role[])
    OR EXISTS (
      SELECT 1 FROM student_classes sc
      JOIN classes c ON c.id = sc.class_id
      WHERE sc.student_id = students.id AND c.teacher_id = auth.uid()
    )
  ))
);

-- INSERT: Principal, Accountant only
CREATE POLICY students_insert ON students FOR INSERT
WITH CHECK (
  (user_id = auth.uid())
  OR
  (school_id IS NOT NULL AND has_role(school_id, ARRAY['principal', 'accountant']::user_role[]))
);

-- UPDATE: Principal, Accountant only
CREATE POLICY students_update ON students FOR UPDATE
USING (
  (user_id = auth.uid())
  OR
  (school_id IS NOT NULL AND has_role(school_id, ARRAY['principal', 'accountant']::user_role[]))
);

-- DELETE: Principal only
CREATE POLICY students_delete ON students FOR DELETE
USING (
  (user_id = auth.uid())
  OR
  (school_id IS NOT NULL AND is_school_principal(school_id))
);

-- ===================
-- PAYMENTS
-- ===================

-- SELECT: Principal, Accountant see all; Cashier sees own
CREATE POLICY payments_select ON payments FOR SELECT
USING (
  (user_id = auth.uid())
  OR
  (school_id IS NOT NULL AND (
    has_role(school_id, ARRAY['principal', 'accountant']::user_role[])
    OR (
      has_role(school_id, ARRAY['cashier']::user_role[])
      AND EXISTS (
        SELECT 1 FROM school_members sm 
        WHERE sm.school_id = payments.school_id 
        AND sm.user_id = auth.uid()
      )
      -- Cashier only sees payments they collected (optional: remove for all)
    )
  ))
);

-- INSERT: Principal, Accountant, Cashier
CREATE POLICY payments_insert ON payments FOR INSERT
WITH CHECK (
  (user_id = auth.uid())
  OR
  (school_id IS NOT NULL AND has_role(school_id, ARRAY['principal', 'accountant', 'cashier']::user_role[]))
);

-- UPDATE: Principal, Accountant only (Cashier cannot edit)
CREATE POLICY payments_update ON payments FOR UPDATE
USING (
  (user_id = auth.uid())
  OR
  (school_id IS NOT NULL AND has_role(school_id, ARRAY['principal', 'accountant']::user_role[]))
);

-- DELETE: Principal only
CREATE POLICY payments_delete ON payments FOR DELETE
USING (
  (user_id = auth.uid())
  OR
  (school_id IS NOT NULL AND is_school_principal(school_id))
);

-- ===================
-- EXPENSES
-- ===================

-- SELECT: Principal, Accountant only
CREATE POLICY expenses_select ON expenses FOR SELECT
USING (
  (user_id = auth.uid())
  OR
  (school_id IS NOT NULL AND has_role(school_id, ARRAY['principal', 'accountant']::user_role[]))
);

-- INSERT: Principal, Accountant only
CREATE POLICY expenses_insert ON expenses FOR INSERT
WITH CHECK (
  (user_id = auth.uid())
  OR
  (school_id IS NOT NULL AND has_role(school_id, ARRAY['principal', 'accountant']::user_role[]))
);

-- UPDATE: Principal, Accountant only
CREATE POLICY expenses_update ON expenses FOR UPDATE
USING (
  (user_id = auth.uid())
  OR
  (school_id IS NOT NULL AND has_role(school_id, ARRAY['principal', 'accountant']::user_role[]))
);

-- DELETE: Principal only
CREATE POLICY expenses_delete ON expenses FOR DELETE
USING (
  (user_id = auth.uid())
  OR
  (school_id IS NOT NULL AND is_school_principal(school_id))
);

-- ===================
-- STAFF
-- ===================

-- SELECT: Principal, Accountant
CREATE POLICY staff_select ON staff FOR SELECT
USING (
  (user_id = auth.uid())
  OR
  (school_id IS NOT NULL AND has_role(school_id, ARRAY['principal', 'accountant']::user_role[]))
);

-- INSERT: Principal only
CREATE POLICY staff_insert ON staff FOR INSERT
WITH CHECK (
  (user_id = auth.uid())
  OR
  (school_id IS NOT NULL AND is_school_principal(school_id))
);

-- UPDATE: Principal only
CREATE POLICY staff_update ON staff FOR UPDATE
USING (
  (user_id = auth.uid())
  OR
  (school_id IS NOT NULL AND is_school_principal(school_id))
);

-- DELETE: Principal only
CREATE POLICY staff_delete ON staff FOR DELETE
USING (
  (user_id = auth.uid())
  OR
  (school_id IS NOT NULL AND is_school_principal(school_id))
);

-- ===================
-- MONTHLY_REPORTS (if exists)
-- ===================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'monthly_reports') THEN
    -- DROP existing policies
    DROP POLICY IF EXISTS monthly_reports_select ON monthly_reports;
    DROP POLICY IF EXISTS monthly_reports_insert ON monthly_reports;
    
    -- SELECT: Principal, Accountant
    EXECUTE 'CREATE POLICY monthly_reports_select ON monthly_reports FOR SELECT
    USING (
      (user_id = auth.uid())
      OR
      (school_id IS NOT NULL AND has_role(school_id, ARRAY[''principal'', ''accountant'']::user_role[]))
    )';
    
    -- INSERT
    EXECUTE 'CREATE POLICY monthly_reports_insert ON monthly_reports FOR INSERT
    WITH CHECK (
      (user_id = auth.uid())
      OR
      (school_id IS NOT NULL AND has_role(school_id, ARRAY[''principal'', ''accountant'']::user_role[]))
    )';
  END IF;
END$$;

COMMIT;
