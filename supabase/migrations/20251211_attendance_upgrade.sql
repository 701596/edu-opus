-- =============================================
-- MIGRATION: Attendance System Upgrade
-- Description: Unifies RLS for School-Wide Access & Adds Analytics RPCs
-- =============================================

-- 1. Helper Function for School Membership Check (Optimization)
-- This avoids repetitive subqueries in RLS policies
CREATE OR REPLACE FUNCTION public.is_school_member(p_school_id UUID, p_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.school_members
    WHERE user_id = auth.uid()
    AND school_id = p_school_id
    AND role::text = ANY(p_roles)
    AND is_active = true
  );
$$;

-- =============================================
-- 2. RLS Policies (Drop existing to be safe/clean)
-- =============================================

-- --- CLASSES ---
DROP POLICY IF EXISTS "Principals can view their school classes" ON public.classes;
DROP POLICY IF EXISTS "Teachers can view their own classes" ON public.classes;
-- Broaden SELECT to ALL school staff (Teacher, Principal, Staff, etc.) based on requirement "Teacher access ALL classes"
-- User specifically asked for: teacher -> SELECT, staff -> SELECT, principal -> full.
CREATE POLICY "School Members View Classes" ON public.classes
FOR SELECT
USING (
  public.is_school_member(school_id, ARRAY['principal', 'teacher', 'staff', 'accountant', 'cashier']::text[])
);

-- --- STUDENTS ---
DROP POLICY IF EXISTS "Principals can view their school students" ON public.students;
DROP POLICY IF EXISTS "Teachers can view their assigned students" ON public.students;
-- Broaden SELECT to ALL school staff
CREATE POLICY "School Members View Students" ON public.students
FOR SELECT
USING (
  public.is_school_member(school_id, ARRAY['principal', 'teacher', 'staff', 'accountant', 'cashier']::text[])
);

-- --- STUDENT_CLASSES (Junction) ---
-- Often doesn't have a school_id directly, usually links student_id and class_id.
-- We must check via class_id -> school_id.
-- Assuming student_classes has class_id FK.
DROP POLICY IF EXISTS "Principals view student_classes" ON public.student_classes;
DROP POLICY IF EXISTS "Teachers view student_classes" ON public.student_classes;

CREATE POLICY "School Members View Student Classes" ON public.student_classes
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.classes c
    WHERE c.id = student_classes.class_id
    AND public.is_school_member(c.school_id, ARRAY['principal', 'teacher', 'staff', 'accountant', 'cashier']::text[])
  )
);

-- --- ATTENDANCE ---
DROP POLICY IF EXISTS "Principals view attendance" ON public.attendance;
DROP POLICY IF EXISTS "Teachers view assigned attendance" ON public.attendance;
DROP POLICY IF EXISTS "Teachers mark attendance" ON public.attendance;

-- SELECT: Teachers, Staff, Principals
CREATE POLICY "School Members View Attendance" ON public.attendance
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.classes c
    WHERE c.id = attendance.class_id
    AND public.is_school_member(c.school_id, ARRAY['principal', 'teacher', 'staff', 'accountant', 'cashier']::text[])
  )
);

-- INSERT: Teachers, Principals ONLY (No Staff)
CREATE POLICY "Teachers and Principals Mark Attendance" ON public.attendance
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.classes c
    WHERE c.id = attendance.class_id
    AND public.is_school_member(c.school_id, ARRAY['principal', 'teacher']::text[])
  )
);

-- UPDATE: Teachers, Principals ONLY
CREATE POLICY "Teachers and Principals Update Attendance" ON public.attendance
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.classes c
    WHERE c.id = attendance.class_id
    AND public.is_school_member(c.school_id, ARRAY['principal', 'teacher']::text[])
  )
);


-- =============================================
-- 3. Analytics RPCs
-- =============================================

-- RPC: Class Attendance Summary
DROP FUNCTION IF EXISTS public.get_class_attendance_summary(UUID);

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
  -- Check permission: User must be able to view this class
  IF NOT EXISTS (
    SELECT 1 FROM public.classes c 
    WHERE c.id = p_class_id 
    AND public.is_school_member(c.school_id, ARRAY['principal', 'teacher', 'staff', 'accountant', 'cashier']::text[])
  ) THEN
    RAISE EXCEPTION 'Access Denied';
  END IF;

  RETURN QUERY
  WITH stats AS (
    SELECT
      a.student_id,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE a.status = 'present') as present
    FROM public.attendance a
    WHERE a.class_id = p_class_id
    GROUP BY a.student_id
  )
  SELECT
    p_class_id as class_id,
    s.id as student_id,
    s.name as student_name,
    COALESCE(st.total, 0) as total_classes,
    COALESCE(st.present, 0) as present_count,
    CASE 
      WHEN COALESCE(st.total, 0) = 0 THEN 0
      ELSE ROUND((st.present::numeric / st.total::numeric) * 100, 2)
    END as attendance_percentage
  FROM public.students s
  JOIN public.student_classes sc ON sc.student_id = s.id
  LEFT JOIN stats st ON st.student_id = s.id
  WHERE sc.class_id = p_class_id
  ORDER BY s.name ASC;
END;
$$;

-- RPC: Student Ranking & Roll Numbers
DROP FUNCTION IF EXISTS public.get_student_attendance_ranking(UUID);

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
    -- Check permission
  IF NOT EXISTS (
    SELECT 1 FROM public.classes c 
    WHERE c.id = p_class_id 
    AND public.is_school_member(c.school_id, ARRAY['principal', 'teacher', 'staff', 'accountant', 'cashier']::text[])
  ) THEN
    RAISE EXCEPTION 'Access Denied';
  END IF;

  RETURN QUERY
  WITH stats AS (
    SELECT
      a.student_id,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE a.status = 'present') as present
    FROM public.attendance a
    WHERE a.class_id = p_class_id
    GROUP BY a.student_id
  )
  SELECT 
    s.id,
    s.name,
    CASE 
      WHEN COALESCE(st.total, 0) = 0 THEN 0
      ELSE ROUND((st.present::numeric / st.total::numeric) * 100, 2)
    END as pct,
    RANK() OVER (
        ORDER BY 
        (CASE WHEN COALESCE(st.total, 0) = 0 THEN 0 ELSE (st.present::numeric / st.total::numeric) END) DESC,
        s.name ASC
    ) as rank
  FROM public.students s
  JOIN public.student_classes sc ON sc.student_id = s.id
  LEFT JOIN stats st ON st.student_id = s.id
  WHERE sc.class_id = p_class_id
  ORDER BY rank ASC;
END;
$$;
