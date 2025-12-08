-- =============================================
-- MIGRATION: RBAC Audit Logs
-- Version: 1.0.0
-- PR: rbac/2025_add_school_members_and_roles
-- =============================================

BEGIN;

-- =============================================
-- STEP 1: Create audit_logs table
-- =============================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES schools(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
  table_name TEXT NOT NULL,
  record_id UUID,
  old_data JSONB,
  new_data JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_audit_logs_school ON audit_logs(school_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table ON audit_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_record ON audit_logs(record_id);

-- =============================================
-- STEP 2: Generic audit trigger function
-- =============================================
CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_school_id UUID := NULL;
  v_old_data JSONB;
  v_new_data JSONB;
  v_record_id UUID;
  v_has_school_id BOOLEAN;
BEGIN
  -- Check if the table has a school_id column
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = TG_TABLE_NAME AND column_name = 'school_id'
  ) INTO v_has_school_id;

  -- Handle based on operation type
  IF TG_OP = 'DELETE' THEN
    v_record_id := OLD.id;
    IF v_has_school_id THEN
      v_school_id := OLD.school_id;
    END IF;
    v_old_data := to_jsonb(OLD) - ARRAY['created_at', 'updated_at'];
    v_new_data := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    v_record_id := NEW.id;
    IF v_has_school_id THEN
      v_school_id := NEW.school_id;
    END IF;
    -- Only log changed fields
    v_old_data := jsonb_strip_nulls(to_jsonb(OLD) - to_jsonb(NEW));
    v_new_data := jsonb_strip_nulls(to_jsonb(NEW) - to_jsonb(OLD));
  ELSE -- INSERT
    v_record_id := NEW.id;
    IF v_has_school_id THEN
      v_school_id := NEW.school_id;
    END IF;
    v_old_data := NULL;
    -- Minimal insert data (no sensitive fields)
    v_new_data := jsonb_build_object('id', NEW.id);
  END IF;

  -- Insert audit log
  INSERT INTO audit_logs (school_id, user_id, action, table_name, record_id, old_data, new_data)
  VALUES (v_school_id, auth.uid(), TG_OP, TG_TABLE_NAME, v_record_id, v_old_data, v_new_data);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- =============================================
-- STEP 3: Create audit triggers for key tables
-- =============================================

-- Audit payments
DROP TRIGGER IF EXISTS audit_payments ON payments;
CREATE TRIGGER audit_payments
AFTER INSERT OR UPDATE OR DELETE ON payments
FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- Audit students
DROP TRIGGER IF EXISTS audit_students ON students;
CREATE TRIGGER audit_students
AFTER INSERT OR UPDATE OR DELETE ON students
FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- Audit attendance
DROP TRIGGER IF EXISTS audit_attendance ON attendance;
CREATE TRIGGER audit_attendance
AFTER INSERT OR UPDATE OR DELETE ON attendance
FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- Audit expenses
DROP TRIGGER IF EXISTS audit_expenses ON expenses;
CREATE TRIGGER audit_expenses
AFTER INSERT OR UPDATE OR DELETE ON expenses
FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- Audit school_members (role changes)
DROP TRIGGER IF EXISTS audit_school_members ON school_members;
CREATE TRIGGER audit_school_members
AFTER INSERT OR UPDATE OR DELETE ON school_members
FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- =============================================
-- STEP 4: RLS for audit_logs
-- =============================================
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_logs_select ON audit_logs;

-- Only principal can view audit logs
CREATE POLICY audit_logs_select ON audit_logs FOR SELECT
USING (
  school_id IS NULL 
  OR is_school_principal(school_id)
);

-- No one can modify audit logs (trigger only)
-- No INSERT/UPDATE/DELETE policies

-- =============================================
-- STEP 5: Audit query functions
-- =============================================

-- Get recent audit logs for a school
CREATE OR REPLACE FUNCTION get_audit_logs(
  p_school_id UUID,
  p_table_name TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE(
  id UUID,
  user_id UUID,
  action TEXT,
  table_name TEXT,
  record_id UUID,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT id, user_id, action, table_name, record_id, old_data, new_data, created_at
  FROM audit_logs
  WHERE school_id = p_school_id
    AND (p_table_name IS NULL OR audit_logs.table_name = p_table_name)
  ORDER BY created_at DESC
  LIMIT p_limit
$$;

-- =============================================
-- STEP 6: Grants
-- =============================================
GRANT SELECT ON audit_logs TO authenticated;
GRANT EXECUTE ON FUNCTION get_audit_logs TO authenticated;

COMMIT;
