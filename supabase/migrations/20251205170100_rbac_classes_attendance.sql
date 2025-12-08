-- =============================================
-- MIGRATION: RBAC Classes & Attendance
-- Version: 1.0.0
-- PR: rbac/2025_add_school_members_and_roles
-- =============================================

BEGIN;

-- =============================================
-- STEP 1: Create classes table
-- =============================================
CREATE TABLE IF NOT EXISTS classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  grade TEXT, -- e.g., "Grade 5", "Class 10A"
  section TEXT, -- e.g., "A", "B"
  teacher_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  academic_year TEXT, -- e.g., "2024-2025"
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_classes_school_id ON classes(school_id);
CREATE INDEX IF NOT EXISTS idx_classes_teacher_id ON classes(teacher_id);

-- =============================================
-- STEP 2: Create student_classes junction (students can be in multiple classes)
-- =============================================
CREATE TABLE IF NOT EXISTS student_classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  UNIQUE(student_id, class_id)
);

CREATE INDEX IF NOT EXISTS idx_student_classes_student ON student_classes(student_id);
CREATE INDEX IF NOT EXISTS idx_student_classes_class ON student_classes(class_id);

-- =============================================
-- STEP 3: Create attendance table
-- =============================================
CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id UUID REFERENCES classes(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late', 'excused')),
  notes TEXT,
  marked_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, class_id, date)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_attendance_school ON attendance(school_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_class ON attendance(class_id);
CREATE INDEX IF NOT EXISTS idx_attendance_marked_by ON attendance(marked_by);

-- =============================================
-- STEP 4: RLS for classes
-- =============================================
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS classes_select ON classes;
DROP POLICY IF EXISTS classes_insert ON classes;
DROP POLICY IF EXISTS classes_update ON classes;
DROP POLICY IF EXISTS classes_delete ON classes;

-- All school members can view classes
CREATE POLICY classes_select ON classes FOR SELECT
USING (
  school_id IN (SELECT school_id FROM school_members WHERE user_id = auth.uid() AND is_active = true)
);

-- Only principal/accountant can create classes
CREATE POLICY classes_insert ON classes FOR INSERT
WITH CHECK (has_role(school_id, ARRAY['principal', 'accountant']::user_role[]));

-- Only principal can update classes
CREATE POLICY classes_update ON classes FOR UPDATE
USING (has_role(school_id, ARRAY['principal']::user_role[]));

-- Only principal can delete classes
CREATE POLICY classes_delete ON classes FOR DELETE
USING (is_school_principal(school_id));

-- =============================================
-- STEP 5: RLS for student_classes
-- =============================================
ALTER TABLE student_classes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS student_classes_select ON student_classes;
DROP POLICY IF EXISTS student_classes_insert ON student_classes;
DROP POLICY IF EXISTS student_classes_delete ON student_classes;

-- Members can see student-class assignments
CREATE POLICY student_classes_select ON student_classes FOR SELECT
USING (
  class_id IN (
    SELECT id FROM classes 
    WHERE school_id IN (SELECT school_id FROM school_members WHERE user_id = auth.uid())
  )
);

-- Principal/accountant can assign students
CREATE POLICY student_classes_insert ON student_classes FOR INSERT
WITH CHECK (
  class_id IN (
    SELECT id FROM classes c
    WHERE has_role(c.school_id, ARRAY['principal', 'accountant']::user_role[])
  )
);

-- Principal can remove assignments
CREATE POLICY student_classes_delete ON student_classes FOR DELETE
USING (
  class_id IN (
    SELECT id FROM classes c WHERE is_school_principal(c.school_id)
  )
);

-- =============================================
-- STEP 6: RLS for attendance
-- =============================================
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS attendance_select ON attendance;
DROP POLICY IF EXISTS attendance_insert ON attendance;
DROP POLICY IF EXISTS attendance_update ON attendance;

-- Principal/accountant see all; teacher sees their classes
CREATE POLICY attendance_select ON attendance FOR SELECT
USING (
  has_role(school_id, ARRAY['principal', 'accountant']::user_role[])
  OR (
    -- Teacher sees only their class attendance
    class_id IN (SELECT id FROM classes WHERE teacher_id = auth.uid())
  )
);

-- Teachers can mark attendance for their classes
CREATE POLICY attendance_insert ON attendance FOR INSERT
WITH CHECK (
  has_role(school_id, ARRAY['principal', 'accountant', 'teacher']::user_role[])
  AND (
    -- Principal/accountant can mark any
    has_role(school_id, ARRAY['principal', 'accountant']::user_role[])
    OR 
    -- Teacher can only mark their own classes
    class_id IN (SELECT id FROM classes WHERE teacher_id = auth.uid())
  )
);

-- Only the marker or principal can update
CREATE POLICY attendance_update ON attendance FOR UPDATE
USING (
  marked_by = auth.uid() 
  OR is_school_principal(school_id)
);

-- =============================================
-- STEP 7: Attendance RPCs
-- =============================================

-- Get attendance for a class on a date
CREATE OR REPLACE FUNCTION get_class_attendance(
  p_class_id UUID,
  p_date DATE
)
RETURNS TABLE(
  student_id UUID,
  student_name TEXT,
  status TEXT,
  notes TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT 
    s.id AS student_id,
    s.name AS student_name,
    COALESCE(a.status, 'unmarked') AS status,
    a.notes
  FROM students s
  JOIN student_classes sc ON sc.student_id = s.id
  LEFT JOIN attendance a ON a.student_id = s.id AND a.class_id = p_class_id AND a.date = p_date
  WHERE sc.class_id = p_class_id AND sc.is_active = true
  ORDER BY s.name
$$;

-- Bulk mark attendance
CREATE OR REPLACE FUNCTION mark_attendance_bulk(
  p_class_id UUID,
  p_date DATE,
  p_attendance JSONB -- Array of {student_id, status, notes}
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_school_id UUID;
  v_count INTEGER := 0;
  v_item JSONB;
BEGIN
  -- Get school_id from class
  SELECT school_id INTO v_school_id FROM classes WHERE id = p_class_id;
  
  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'Class not found';
  END IF;
  
  -- Check permission
  IF NOT (
    has_role(v_school_id, ARRAY['principal', 'accountant']::user_role[])
    OR EXISTS (SELECT 1 FROM classes WHERE id = p_class_id AND teacher_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  
  -- Upsert attendance records
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_attendance)
  LOOP
    INSERT INTO attendance (school_id, student_id, class_id, date, status, notes, marked_by)
    VALUES (
      v_school_id,
      (v_item->>'student_id')::UUID,
      p_class_id,
      p_date,
      v_item->>'status',
      v_item->>'notes',
      auth.uid()
    )
    ON CONFLICT (student_id, class_id, date) DO UPDATE SET
      status = EXCLUDED.status,
      notes = EXCLUDED.notes,
      marked_by = EXCLUDED.marked_by,
      updated_at = NOW();
    
    v_count := v_count + 1;
  END LOOP;
  
  RETURN v_count;
END;
$$;

-- Get attendance stats for a class
CREATE OR REPLACE FUNCTION get_attendance_stats(
  p_class_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE(
  student_id UUID,
  student_name TEXT,
  total_days INTEGER,
  present_days INTEGER,
  absent_days INTEGER,
  late_days INTEGER,
  attendance_pct NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  WITH date_range AS (
    SELECT generate_series(p_start_date, p_end_date, '1 day'::interval)::date AS date
  ),
  student_list AS (
    SELECT s.id, s.name
    FROM students s
    JOIN student_classes sc ON sc.student_id = s.id
    WHERE sc.class_id = p_class_id AND sc.is_active = true
  )
  SELECT 
    sl.id AS student_id,
    sl.name AS student_name,
    (SELECT COUNT(*)::INTEGER FROM date_range) AS total_days,
    COUNT(CASE WHEN a.status = 'present' THEN 1 END)::INTEGER AS present_days,
    COUNT(CASE WHEN a.status = 'absent' THEN 1 END)::INTEGER AS absent_days,
    COUNT(CASE WHEN a.status = 'late' THEN 1 END)::INTEGER AS late_days,
    ROUND(
      COUNT(CASE WHEN a.status = 'present' THEN 1 END)::NUMERIC / 
      NULLIF((SELECT COUNT(*) FROM date_range), 0) * 100, 2
    ) AS attendance_pct
  FROM student_list sl
  LEFT JOIN attendance a ON a.student_id = sl.id AND a.class_id = p_class_id AND a.date BETWEEN p_start_date AND p_end_date
  GROUP BY sl.id, sl.name
  ORDER BY sl.name
$$;

-- =============================================
-- STEP 8: Grants
-- =============================================
GRANT SELECT, INSERT, UPDATE, DELETE ON classes TO authenticated;
GRANT SELECT, INSERT, DELETE ON student_classes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON attendance TO authenticated;
GRANT EXECUTE ON FUNCTION get_class_attendance TO authenticated;
GRANT EXECUTE ON FUNCTION mark_attendance_bulk TO authenticated;
GRANT EXECUTE ON FUNCTION get_attendance_stats TO authenticated;

COMMIT;
