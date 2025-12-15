-- =============================================
-- MIGRATION: Fix Attendance Duplicates
-- Description: 
-- 1. Updates `get_class_attendance_paginated` to ensure unique students.
-- 2. Adds unique constraint to `attendance` table.
-- 3. Updates `mark_attendance_bulk` to use ON CONFLICT DO UPDATE.
-- =============================================

-- 1. Clean up potential duplicates in attendance (keep latest)
DELETE FROM public.attendance a
USING public.attendance b
WHERE a.ctid < b.ctid
AND a.student_id = b.student_id
AND a.class_id = b.class_id
AND a.date = b.date;

-- 2. Add Unique Constraint (Idempotent)
ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_unique_entry;

ALTER TABLE public.attendance
ADD CONSTRAINT attendance_unique_entry UNIQUE (student_id, class_id, date);

-- 3. Update Paginated RPC (Deduplication Logic just in case)
CREATE OR REPLACE FUNCTION public.get_class_attendance_paginated(
    p_class_id UUID, 
    p_date DATE, 
    p_page INTEGER DEFAULT 1, 
    p_limit INTEGER DEFAULT 100
)
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
DECLARE
    v_offset INTEGER;
BEGIN
    v_offset := (p_page - 1) * p_limit;

    RETURN QUERY
    SELECT DISTINCT ON (s.name, s.id) -- Ensure unicity by student
        s.id AS student_id,
        s.name AS student_name,
        COALESCE(a.status::text, 'unmarked') AS status,
        a.notes
    FROM public.students s
    JOIN public.classes c ON s.class = c.grade
    LEFT JOIN public.attendance a ON s.id = a.student_id AND a.class_id = p_class_id AND a.date = p_date
    WHERE c.id = p_class_id
    ORDER BY s.name ASC, s.id
    LIMIT p_limit OFFSET v_offset;
END;
$$;

-- 4. Update Bulk Mark RPC to use UPSERT
-- 4. Update Bulk Mark RPC to use UPSERT and include school_id
DROP FUNCTION IF EXISTS public.mark_attendance_bulk(UUID, DATE, JSONB);

CREATE OR REPLACE FUNCTION public.mark_attendance_bulk(
    p_class_id UUID,
    p_date DATE,
    p_attendance JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    item JSONB;
    v_school_id UUID;
BEGIN
    -- Get School ID from Class
    SELECT school_id INTO v_school_id
    FROM public.classes
    WHERE id = p_class_id;

    IF v_school_id IS NULL THEN
        RAISE EXCEPTION 'Class not found or invalid school_id';
    END IF;

    FOR item IN SELECT * FROM jsonb_array_elements(p_attendance)
    LOOP
        INSERT INTO public.attendance (student_id, class_id, school_id, marked_by, date, status, notes)
        VALUES (
            (item->>'student_id')::UUID,
            p_class_id,
            v_school_id,
            auth.uid(),
            p_date,
            (item->>'status')::text,
            (item->>'notes')::TEXT
        )
        ON CONFLICT (student_id, class_id, date) 
        DO UPDATE SET
            status = EXCLUDED.status,
            notes = EXCLUDED.notes,
            marked_by = EXCLUDED.marked_by;
    END LOOP;
END;
$$;

-- 5. Redefine Ranking RPC to force deduplication (Fix for duplicates in UI)
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
  WITH stats AS (
    SELECT
      a.student_id,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE a.status = 'present') as present
    FROM public.attendance a
    WHERE a.class_id = p_class_id
    GROUP BY a.student_id
  )
  SELECT DISTINCT ON (s.id) -- Force unique students
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
  JOIN public.classes c ON s.class = c.grade
  LEFT JOIN stats st ON st.student_id = s.id
  WHERE c.id = p_class_id
  ORDER BY s.id; -- Match DISTINCT ON
END;
$$;
