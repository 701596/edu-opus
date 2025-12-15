-- =============================================
-- MIGRATION: Fix Attendance RPC
-- Description: Override get_class_attendance with SECURITY DEFINER to resolve RLS issues.
-- =============================================

DROP FUNCTION IF EXISTS public.get_class_attendance(UUID, DATE);
DROP FUNCTION IF EXISTS public.get_class_attendance(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.get_class_attendance(p_class_id UUID, p_date DATE DEFAULT CURRENT_DATE)
RETURNS TABLE (
    student_id UUID,
    student_name TEXT,
    status TEXT, -- Cast to text for frontend flexibility
    notes TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER -- Bypass RLS
SET search_path = public
AS $$
BEGIN
    -- 1. Strict Permission Check
    -- Ensure the requesting user is a member of the school that owns this class
    IF NOT EXISTS (
        SELECT 1 
        FROM public.classes c
        WHERE c.id = p_class_id
        AND public.is_school_member(c.school_id, ARRAY['principal', 'teacher', 'staff', 'accountant', 'cashier']::text[])
    ) THEN
        RAISE EXCEPTION 'Access Denied: You do not have permission to view this class.';
    END IF;

    -- 2. Fetch Data
    -- We join students -> student_classes -> attendance
    -- Using LEFT JOIN on attendance to show 'unmarked' if no record exists
    RETURN QUERY
    SELECT 
        s.id AS student_id,
        s.name AS student_name,
        COALESCE(a.status::text, 'unmarked') AS status,
        a.notes
    FROM public.students s
    JOIN public.student_classes sc ON s.id = sc.student_id
    LEFT JOIN public.attendance a ON s.id = a.student_id AND a.class_id = p_class_id AND a.date = p_date
    WHERE sc.class_id = p_class_id
    ORDER BY s.name ASC;
END;
$$;
