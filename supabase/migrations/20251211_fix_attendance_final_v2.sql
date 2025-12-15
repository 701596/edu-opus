-- =============================================
-- MIGRATION: FINAL ATTENDANCE FIX (V2)
-- Description: 
-- 1. Adds `marked_by`, `school_id` columns safely.
-- 2. Removes duplicates and adds constraints.
-- 3. Updates RPCs for Deduplication and Past Edit Locking.
-- =============================================

-- 1. Add Columns if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'attendance' AND column_name = 'marked_by') THEN
        ALTER TABLE public.attendance ADD COLUMN marked_by UUID REFERENCES auth.users(id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'attendance' AND column_name = 'school_id') THEN
        ALTER TABLE public.attendance ADD COLUMN school_id UUID REFERENCES public.schools(id);
    END IF;
END $$;

-- 2. Clean Duplicates (Keep Latest)
DELETE FROM public.attendance a
USING public.attendance b
WHERE a.ctid < b.ctid
AND a.student_id = b.student_id
AND a.class_id = b.class_id
AND a.date = b.date;

-- 3. Add Unique Constraint (Idempotent)
ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_unique_entry;
ALTER TABLE public.attendance ADD CONSTRAINT attendance_unique_entry UNIQUE (student_id, class_id, date);

-- 4. Mark Attendance Bulk (With Past Lock & Fixes)
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
    v_current_user UUID;
BEGIN
    -- 1. Lock Past Attendance
    IF p_date < CURRENT_DATE THEN
        RAISE EXCEPTION 'Cannot modify attendance for past dates.';
    END IF;

    -- 2. Get Context
    v_current_user := auth.uid();
    
    -- 3. Get School ID
    SELECT school_id INTO v_school_id FROM public.classes WHERE id = p_class_id;
    IF v_school_id IS NULL THEN
        RAISE EXCEPTION 'Class not found or invalid school_id';
    END IF;

    -- 4. Upsert Attendance
    FOR item IN SELECT * FROM jsonb_array_elements(p_attendance)
    LOOP
        INSERT INTO public.attendance (student_id, class_id, school_id, marked_by, date, status, notes)
        VALUES (
            (item->>'student_id')::UUID,
            p_class_id,
            v_school_id,
            v_current_user,
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

-- 5. Paginated Fetch (Deduplicated - ChatGPT Recommended Fix)
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
    SELECT DISTINCT ON (s.id) -- Force Unique Student per row
        s.id AS student_id,
        s.name AS student_name,
        COALESCE(a.status::text, 'unmarked') AS status,
        a.notes
    FROM public.students s
    JOIN public.classes c ON s.class = c.grade -- Correct JOIN for this schema
    LEFT JOIN public.attendance a ON s.id = a.student_id AND a.class_id = p_class_id AND a.date = p_date
    WHERE c.id = p_class_id
    ORDER BY s.id, s.name ASC -- Required for DISTINCT ON
    LIMIT p_limit OFFSET v_offset;
END;
$$;

-- 6. Ranking (Deduplicated)
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
  SELECT DISTINCT ON (s.id) -- Deduplicate
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
  ORDER BY s.id;
END;
$$;
