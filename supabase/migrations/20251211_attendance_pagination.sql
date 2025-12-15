-- =============================================
-- MIGRATION: Attendance Pagination
-- Description: 
-- Adds separate count RPC and paginated attendance fetch.
-- =============================================

-- 1. Get Class Student Count (For Pagination)
CREATE OR REPLACE FUNCTION public.get_class_student_count(p_class_id UUID)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)
        FROM public.students s
        JOIN public.classes c ON s.class = c.grade -- JOIN BY GRADE
        WHERE c.id = p_class_id
    );
END;
$$;

-- 2. Paginated Attendance List
-- Returns list of students for a specific page with current attendance status
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
    SELECT 
        s.id AS student_id,
        s.name AS student_name,
        COALESCE(a.status::text, 'unmarked') AS status,
        a.notes
    FROM public.students s
    JOIN public.classes c ON s.class = c.grade -- JOIN BY GRADE
    LEFT JOIN public.attendance a ON s.id = a.student_id AND a.class_id = p_class_id AND a.date = p_date
    WHERE c.id = p_class_id
    ORDER BY s.name ASC
    LIMIT p_limit OFFSET v_offset;
END;
$$;
