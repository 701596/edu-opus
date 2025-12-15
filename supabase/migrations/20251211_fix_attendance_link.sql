-- =============================================
-- MIGRATION: Fix Attendance Link (Schema Logic)
-- Description: 
-- The system was built assuming a junction table `student_classes` existed.
-- Diagnostic data shows students are linked directly by `students.class` (text) matching `classes.name` (text).
-- This migration redefines all RPCs to use this text-based link.
-- =============================================

-- 1. Get Class Attendance (Daily List)
CREATE OR REPLACE FUNCTION public.get_class_attendance(p_class_id UUID, p_date DATE DEFAULT CURRENT_DATE)
RETURNS TABLE (
    student_id UUID,
    student_name TEXT,
    status TEXT,
    notes TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id AS student_id,
        s.name AS student_name,
        COALESCE(a.status::text, 'unmarked') AS status,
        a.notes
    FROM public.students s
    JOIN public.classes c ON s.class = c.grade -- JOIN BY GRADE (e.g. "Grade 10", "X")
    LEFT JOIN public.attendance a ON s.id = a.student_id AND a.class_id = p_class_id AND a.date = p_date
    WHERE c.id = p_class_id -- Filter by Class ID -> resolves to Name -> filters Students
    ORDER BY s.name ASC;
END;
$$;

-- 2. Class Attendance Summary (Analytics)
CREATE OR REPLACE FUNCTION public.get_class_attendance_summary(p_class_id UUID)
RETURNS TABLE (
  class_id UUID,
  student_id UUID,
  student_name TEXT,
  total_classes BIGINT,
  present_count BIGINT,
  attendance_percentage NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH class_students AS (
    SELECT s.id, s.name, c.id as c_id
    FROM public.students s
    JOIN public.classes c ON s.class = c.grade -- JOIN BY GRADE
    WHERE c.id = p_class_id
  ),
  stats AS (
    SELECT 
      a.student_id,
      COUNT(*) FILTER (WHERE a.status != 'unmarked') as total,
      COUNT(*) FILTER (WHERE a.status = 'present') as present
    FROM public.attendance a
    WHERE a.class_id = p_class_id
    GROUP BY a.student_id
  )
  SELECT 
    p_class_id,
    cs.id,
    cs.name,
    COALESCE(st.total, 0),
    COALESCE(st.present, 0),
    CASE 
      WHEN COALESCE(st.total, 0) = 0 THEN 0
      ELSE ROUND((COALESCE(st.present, 0)::numeric / st.total::numeric) * 100, 1)
    END
  FROM class_students cs
  LEFT JOIN stats st ON cs.id = st.student_id;
END;
$$;

-- 3. Student Ranking (Roll Numbers)
CREATE OR REPLACE FUNCTION public.get_student_attendance_ranking(p_class_id UUID)
RETURNS TABLE (
    student_id UUID,
    student_name TEXT,
    attendance_percentage NUMERIC,
    rank BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH summary AS (
        SELECT * FROM public.get_class_attendance_summary(p_class_id)
    )
    SELECT 
        s.student_id,
        s.student_name::text, -- Cast to ensure type matching
        s.attendance_percentage,
        RANK() OVER (ORDER BY s.attendance_percentage DESC, s.student_name ASC)
    FROM summary s;
END;
$$;

