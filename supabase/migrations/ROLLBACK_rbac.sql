-- =============================================
-- ROLLBACK: RBAC System
-- Version: 1.0.0
-- PR: rbac/2025_add_school_members_and_roles
-- =============================================
-- DANGER: Only run if absolutely necessary
-- This will remove RBAC tables but preserve data in existing tables
-- =============================================

BEGIN;

-- =============================================
-- STEP 1: Remove triggers
-- =============================================
DROP TRIGGER IF EXISTS trg_auto_add_principal ON schools;
DROP TRIGGER IF EXISTS audit_payments ON payments;
DROP TRIGGER IF EXISTS audit_students ON students;
DROP TRIGGER IF EXISTS audit_attendance ON attendance;
DROP TRIGGER IF EXISTS audit_expenses ON expenses;
DROP TRIGGER IF EXISTS audit_school_members ON school_members;

-- =============================================
-- STEP 2: Remove new RLS policies (restore will use old ones)
-- =============================================
DROP POLICY IF EXISTS students_select ON students;
DROP POLICY IF EXISTS students_insert ON students;
DROP POLICY IF EXISTS students_update ON students;
DROP POLICY IF EXISTS students_delete ON students;

DROP POLICY IF EXISTS payments_select ON payments;
DROP POLICY IF EXISTS payments_insert ON payments;
DROP POLICY IF EXISTS payments_update ON payments;
DROP POLICY IF EXISTS payments_delete ON payments;

DROP POLICY IF EXISTS expenses_select ON expenses;
DROP POLICY IF EXISTS expenses_insert ON expenses;
DROP POLICY IF EXISTS expenses_update ON expenses;
DROP POLICY IF EXISTS expenses_delete ON expenses;

DROP POLICY IF EXISTS staff_select ON staff;
DROP POLICY IF EXISTS staff_insert ON staff;
DROP POLICY IF EXISTS staff_update ON staff;
DROP POLICY IF EXISTS staff_delete ON staff;

-- =============================================
-- STEP 3: Restore original RLS policies
-- =============================================
CREATE POLICY "Users can view own students" ON students FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can create own students" ON students FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own students" ON students FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Users can delete own students" ON students FOR DELETE
USING (user_id = auth.uid());

CREATE POLICY "Users can view own payments" ON payments FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can create own payments" ON payments FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own payments" ON payments FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Users can delete own payments" ON payments FOR DELETE
USING (user_id = auth.uid());

CREATE POLICY "Users can view own expenses" ON expenses FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can create own expenses" ON expenses FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own expenses" ON expenses FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Users can delete own expenses" ON expenses FOR DELETE
USING (user_id = auth.uid());

-- =============================================
-- STEP 4: Drop new functions (optional - can keep for future)
-- =============================================
-- Uncomment if you want full removal:
/*
DROP FUNCTION IF EXISTS get_user_school_id;
DROP FUNCTION IF EXISTS get_user_role;
DROP FUNCTION IF EXISTS has_role;
DROP FUNCTION IF EXISTS is_principal;
DROP FUNCTION IF EXISTS is_school_principal;
DROP FUNCTION IF EXISTS get_user_roles;
DROP FUNCTION IF EXISTS create_school_invite;
DROP FUNCTION IF EXISTS accept_school_invite;
DROP FUNCTION IF EXISTS get_school_invites;
DROP FUNCTION IF EXISTS revoke_school_invite;
DROP FUNCTION IF EXISTS get_class_attendance;
DROP FUNCTION IF EXISTS mark_attendance_bulk;
DROP FUNCTION IF EXISTS get_attendance_stats;
DROP FUNCTION IF EXISTS get_audit_logs;
DROP FUNCTION IF EXISTS audit_trigger_func;
DROP FUNCTION IF EXISTS auto_add_principal;
*/

-- =============================================
-- STEP 5: Drop new tables (CAREFUL - data loss!)
-- =============================================
-- Only uncomment if you are SURE you want to remove all RBAC data:
/*
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS school_invites CASCADE;
DROP TABLE IF EXISTS attendance CASCADE;
DROP TABLE IF EXISTS student_classes CASCADE;
DROP TABLE IF EXISTS classes CASCADE;
DROP TABLE IF EXISTS school_members CASCADE;
DROP TABLE IF EXISTS schools CASCADE;
DROP TYPE IF EXISTS user_role;
*/

-- =============================================
-- STEP 6: DO NOT drop school_id columns
-- =============================================
-- Keep school_id columns in existing tables
-- They are nullable and won't break anything
-- This preserves option to re-enable RBAC later

COMMIT;

-- =============================================
-- AFTER ROLLBACK
-- =============================================
-- 1. Set USE_SCHOOL_MODE=false in app env
-- 2. Redeploy frontend
-- 3. Verify original functionality works
-- 4. If needed, restore from DB snapshot
