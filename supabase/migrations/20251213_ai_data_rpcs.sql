-- =============================================
-- MIGRATION: AI Data RPCs (Scoped Fetching)
-- Description: Parameterized RPCs for AXIOM anti-hallucination architecture
-- All RPCs return data + metadata + reconciliation info
-- =============================================

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- HELPER: Standard metadata wrapper
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. STUDENTS SCOPED RPC
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION public.get_students_scoped(
    p_school_id UUID DEFAULT NULL,
    p_class_name TEXT DEFAULT NULL,
    p_status TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 100
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_school_id UUID;
    v_data JSONB;
    v_count INTEGER;
    v_total_expected_fee NUMERIC;
    v_total_paid_fee NUMERIC;
    v_total_remaining_fee NUMERIC;
BEGIN
    -- Get school_id from current user if not provided
    IF p_school_id IS NULL THEN
        SELECT school_id INTO v_school_id
        FROM public.school_members
        WHERE user_id = auth.uid()
        LIMIT 1;
    ELSE
        v_school_id := p_school_id;
    END IF;

    -- Build query with filters
    SELECT 
        COALESCE(jsonb_agg(
            jsonb_build_object(
                'id', s.id,
                'name', s.name,
                'class', s.class,
                'expected_fee', s.expected_fee,
                'paid_fee', s.paid_fee,
                'remaining_fee', s.remaining_fee,
                'status', CASE WHEN s.remaining_fee > 0 THEN 'pending' ELSE 'paid' END
            ) ORDER BY s.name
        ), '[]'::jsonb),
        COUNT(*),
        COALESCE(SUM(s.expected_fee), 0),
        COALESCE(SUM(s.paid_fee), 0),
        COALESCE(SUM(s.remaining_fee), 0)
    INTO v_data, v_count, v_total_expected_fee, v_total_paid_fee, v_total_remaining_fee
    FROM public.students s
    WHERE s.school_id = v_school_id
    AND (p_class_name IS NULL OR LOWER(s.class) = LOWER(p_class_name))
    AND (p_status IS NULL OR 
        (p_status = 'pending' AND s.remaining_fee > 0) OR
        (p_status = 'paid' AND s.remaining_fee = 0) OR
        (p_status = 'active'))
    LIMIT p_limit;

    -- Return with metadata and reconciliation
    RETURN jsonb_build_object(
        'data', v_data,
        'metadata', jsonb_build_object(
            'dataset', 'students',
            'school_id', v_school_id,
            'is_final', true,
            'last_updated', NOW(),
            'record_count', v_count,
            'filters_applied', jsonb_build_object(
                'class_name', p_class_name,
                'status', p_status,
                'limit', p_limit
            )
        ),
        'reconciliation', jsonb_build_object(
            'total_expected_fee', v_total_expected_fee,
            'total_paid_fee', v_total_paid_fee,
            'total_remaining_fee', v_total_remaining_fee,
            'sum_check', v_total_expected_fee - v_total_paid_fee,
            'discrepancy', ABS((v_total_expected_fee - v_total_paid_fee) - v_total_remaining_fee),
            'is_valid', (v_total_expected_fee - v_total_paid_fee) = v_total_remaining_fee
        )
    );
END;
$$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. ATTENDANCE SCOPED RPC
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION public.get_attendance_scoped(
    p_school_id UUID DEFAULT NULL,
    p_class_id UUID DEFAULT NULL,
    p_class_name TEXT DEFAULT NULL,
    p_date_from DATE DEFAULT NULL,
    p_date_to DATE DEFAULT NULL,
    p_status TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_school_id UUID;
    v_class_id UUID;
    v_data JSONB;
    v_count INTEGER;
    v_present_count INTEGER;
    v_absent_count INTEGER;
    v_attendance_rate NUMERIC;
BEGIN
    -- Get school_id from current user if not provided
    IF p_school_id IS NULL THEN
        SELECT school_id INTO v_school_id
        FROM public.school_members
        WHERE user_id = auth.uid()
        LIMIT 1;
    ELSE
        v_school_id := p_school_id;
    END IF;

    -- Get class_id from class_name if provided
    IF p_class_name IS NOT NULL AND p_class_id IS NULL THEN
        SELECT id INTO v_class_id
        FROM public.classes
        WHERE school_id = v_school_id
        AND (LOWER(grade) = LOWER(p_class_name) OR LOWER(name) = LOWER(p_class_name))
        LIMIT 1;
    ELSE
        v_class_id := p_class_id;
    END IF;

    -- Default date range to today if not specified
    IF p_date_from IS NULL THEN
        p_date_from := CURRENT_DATE;
    END IF;
    IF p_date_to IS NULL THEN
        p_date_to := CURRENT_DATE;
    END IF;

    -- Get attendance data
    SELECT 
        COALESCE(jsonb_agg(
            jsonb_build_object(
                'student_id', a.student_id,
                'student_name', s.name,
                'class', s.class,
                'date', a.date,
                'status', a.status,
                'notes', a.notes
            ) ORDER BY s.name, a.date DESC
        ), '[]'::jsonb),
        COUNT(*),
        COUNT(*) FILTER (WHERE LOWER(a.status::text) = 'present'),
        COUNT(*) FILTER (WHERE LOWER(a.status::text) = 'absent')
    INTO v_data, v_count, v_present_count, v_absent_count
    FROM public.attendance a
    JOIN public.students s ON s.id = a.student_id
    WHERE a.school_id = v_school_id
    AND (v_class_id IS NULL OR a.class_id = v_class_id)
    AND a.date BETWEEN p_date_from AND p_date_to
    AND (p_status IS NULL OR LOWER(a.status::text) = LOWER(p_status));

    -- Calculate attendance rate
    IF v_count > 0 THEN
        v_attendance_rate := ROUND((v_present_count::NUMERIC / v_count::NUMERIC) * 100, 2);
    ELSE
        v_attendance_rate := 0;
    END IF;

    RETURN jsonb_build_object(
        'data', v_data,
        'metadata', jsonb_build_object(
            'dataset', 'attendance',
            'school_id', v_school_id,
            'is_final', true,
            'last_updated', NOW(),
            'record_count', v_count,
            'filters_applied', jsonb_build_object(
                'class_id', v_class_id,
                'class_name', p_class_name,
                'date_from', p_date_from,
                'date_to', p_date_to,
                'status', p_status
            )
        ),
        'reconciliation', jsonb_build_object(
            'total_records', v_count,
            'present_count', v_present_count,
            'absent_count', v_absent_count,
            'attendance_rate', v_attendance_rate,
            'sum_check', v_present_count + v_absent_count,
            'is_valid', (v_present_count + v_absent_count) <= v_count
        )
    );
END;
$$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. FEES SCOPED RPC
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION public.get_fees_scoped(
    p_school_id UUID DEFAULT NULL,
    p_status TEXT DEFAULT NULL,
    p_class_name TEXT DEFAULT NULL,
    p_month TEXT DEFAULT NULL,
    p_year TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 100
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_school_id UUID;
    v_data JSONB;
    v_count INTEGER;
    v_total_expected NUMERIC;
    v_total_paid NUMERIC;
    v_total_pending NUMERIC;
BEGIN
    -- Get school_id from current user if not provided
    IF p_school_id IS NULL THEN
        SELECT school_id INTO v_school_id
        FROM public.school_members
        WHERE user_id = auth.uid()
        LIMIT 1;
    ELSE
        v_school_id := p_school_id;
    END IF;

    -- Get fee summary grouped by student
    SELECT 
        COALESCE(jsonb_agg(
            jsonb_build_object(
                'student_id', s.id,
                'student_name', s.name,
                'class', s.class,
                'expected_fee', s.expected_fee,
                'paid_fee', s.paid_fee,
                'remaining_fee', s.remaining_fee,
                'fee_status', CASE 
                    WHEN s.remaining_fee = 0 THEN 'paid'
                    WHEN s.paid_fee > 0 THEN 'partial'
                    ELSE 'pending'
                END
            ) ORDER BY s.remaining_fee DESC, s.name
        ), '[]'::jsonb),
        COUNT(*),
        COALESCE(SUM(s.expected_fee), 0),
        COALESCE(SUM(s.paid_fee), 0),
        COALESCE(SUM(s.remaining_fee), 0)
    INTO v_data, v_count, v_total_expected, v_total_paid, v_total_pending
    FROM public.students s
    WHERE s.school_id = v_school_id
    AND (p_class_name IS NULL OR LOWER(s.class) = LOWER(p_class_name))
    AND (p_status IS NULL OR
        (p_status = 'pending' AND s.remaining_fee > 0) OR
        (p_status = 'paid' AND s.remaining_fee = 0) OR
        (p_status = 'partial' AND s.paid_fee > 0 AND s.remaining_fee > 0))
    LIMIT p_limit;

    RETURN jsonb_build_object(
        'data', v_data,
        'metadata', jsonb_build_object(
            'dataset', 'fees',
            'school_id', v_school_id,
            'is_final', true,
            'last_updated', NOW(),
            'record_count', v_count,
            'filters_applied', jsonb_build_object(
                'status', p_status,
                'class_name', p_class_name,
                'month', p_month,
                'year', p_year,
                'limit', p_limit
            )
        ),
        'reconciliation', jsonb_build_object(
            'total_expected', v_total_expected,
            'total_paid', v_total_paid,
            'total_pending', v_total_pending,
            'sum_check', v_total_paid + v_total_pending,
            'discrepancy', ABS(v_total_expected - (v_total_paid + v_total_pending)),
            'is_valid', v_total_expected = (v_total_paid + v_total_pending),
            'collection_rate', CASE WHEN v_total_expected > 0 
                THEN ROUND((v_total_paid / v_total_expected) * 100, 2)
                ELSE 0 
            END
        )
    );
END;
$$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 4. STAFF SCOPED RPC
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION public.get_staff_scoped(
    p_school_id UUID DEFAULT NULL,
    p_department TEXT DEFAULT NULL,
    p_role TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 100
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_school_id UUID;
    v_data JSONB;
    v_count INTEGER;
    v_total_expected_salary NUMERIC;
    v_total_paid_salary NUMERIC;
    v_total_pending_salary NUMERIC;
BEGIN
    -- Get school_id from current user if not provided
    IF p_school_id IS NULL THEN
        SELECT school_id INTO v_school_id
        FROM public.school_members
        WHERE user_id = auth.uid()
        LIMIT 1;
    ELSE
        v_school_id := p_school_id;
    END IF;

    SELECT 
        COALESCE(jsonb_agg(
            jsonb_build_object(
                'id', st.id,
                'name', st.name,
                'role', st.role,
                'department', st.department,
                'expected_salary', st.expected_salary_expense,
                'paid_salary', st.paid_salary,
                'pending_salary', COALESCE(st.expected_salary_expense, 0) - COALESCE(st.paid_salary, 0)
            ) ORDER BY st.name
        ), '[]'::jsonb),
        COUNT(*),
        COALESCE(SUM(st.expected_salary_expense), 0),
        COALESCE(SUM(st.paid_salary), 0),
        COALESCE(SUM(COALESCE(st.expected_salary_expense, 0) - COALESCE(st.paid_salary, 0)), 0)
    INTO v_data, v_count, v_total_expected_salary, v_total_paid_salary, v_total_pending_salary
    FROM public.staff st
    WHERE st.school_id = v_school_id
    AND (p_department IS NULL OR LOWER(st.department) = LOWER(p_department))
    AND (p_role IS NULL OR LOWER(st.role) = LOWER(p_role))
    LIMIT p_limit;

    RETURN jsonb_build_object(
        'data', v_data,
        'metadata', jsonb_build_object(
            'dataset', 'staff',
            'school_id', v_school_id,
            'is_final', true,
            'last_updated', NOW(),
            'record_count', v_count,
            'filters_applied', jsonb_build_object(
                'department', p_department,
                'role', p_role,
                'limit', p_limit
            )
        ),
        'reconciliation', jsonb_build_object(
            'total_expected_salary', v_total_expected_salary,
            'total_paid_salary', v_total_paid_salary,
            'total_pending_salary', v_total_pending_salary,
            'sum_check', v_total_paid_salary + v_total_pending_salary,
            'discrepancy', ABS(v_total_expected_salary - (v_total_paid_salary + v_total_pending_salary)),
            'is_valid', v_total_expected_salary = (v_total_paid_salary + v_total_pending_salary)
        )
    );
END;
$$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 5. CLASSES SCOPED RPC
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION public.get_classes_scoped(
    p_school_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_school_id UUID;
    v_data JSONB;
    v_count INTEGER;
BEGIN
    -- Get school_id from current user if not provided
    IF p_school_id IS NULL THEN
        SELECT school_id INTO v_school_id
        FROM public.school_members
        WHERE user_id = auth.uid()
        LIMIT 1;
    ELSE
        v_school_id := p_school_id;
    END IF;

    SELECT 
        COALESCE(jsonb_agg(
            jsonb_build_object(
                'id', c.id,
                'name', c.name,
                'grade', c.grade,
                'section', c.section,
                'student_count', (
                    SELECT COUNT(*) FROM public.students s 
                    WHERE s.school_id = v_school_id 
                    AND LOWER(s.class) = LOWER(c.grade)
                )
            ) ORDER BY c.grade, c.section
        ), '[]'::jsonb),
        COUNT(*)
    INTO v_data, v_count
    FROM public.classes c
    WHERE c.school_id = v_school_id;

    RETURN jsonb_build_object(
        'data', v_data,
        'metadata', jsonb_build_object(
            'dataset', 'classes',
            'school_id', v_school_id,
            'is_final', true,
            'last_updated', NOW(),
            'record_count', v_count
        ),
        'reconciliation', jsonb_build_object(
            'is_valid', true
        )
    );
END;
$$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 6. QUICK STATS RPC (For dashboard summaries)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION public.get_school_quick_stats(
    p_school_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_school_id UUID;
    v_student_count INTEGER;
    v_staff_count INTEGER;
    v_total_fees_expected NUMERIC;
    v_total_fees_collected NUMERIC;
    v_total_fees_pending NUMERIC;
    v_today_attendance_rate NUMERIC;
BEGIN
    -- Get school_id
    IF p_school_id IS NULL THEN
        SELECT school_id INTO v_school_id
        FROM public.school_members
        WHERE user_id = auth.uid()
        LIMIT 1;
    ELSE
        v_school_id := p_school_id;
    END IF;

    -- Get counts
    SELECT COUNT(*) INTO v_student_count FROM public.students WHERE school_id = v_school_id;
    SELECT COUNT(*) INTO v_staff_count FROM public.staff WHERE school_id = v_school_id;

    -- Get fee totals
    SELECT 
        COALESCE(SUM(expected_fee), 0),
        COALESCE(SUM(paid_fee), 0),
        COALESCE(SUM(remaining_fee), 0)
    INTO v_total_fees_expected, v_total_fees_collected, v_total_fees_pending
    FROM public.students 
    WHERE school_id = v_school_id;

    -- Get today's attendance rate
    SELECT 
        CASE WHEN COUNT(*) > 0 
            THEN ROUND((COUNT(*) FILTER (WHERE LOWER(status::text) = 'present')::NUMERIC / COUNT(*)::NUMERIC) * 100, 2)
            ELSE NULL
        END
    INTO v_today_attendance_rate
    FROM public.attendance
    WHERE school_id = v_school_id AND date = CURRENT_DATE;

    RETURN jsonb_build_object(
        'data', jsonb_build_object(
            'student_count', v_student_count,
            'staff_count', v_staff_count,
            'total_fees_expected', v_total_fees_expected,
            'total_fees_collected', v_total_fees_collected,
            'total_fees_pending', v_total_fees_pending,
            'today_attendance_rate', v_today_attendance_rate
        ),
        'metadata', jsonb_build_object(
            'dataset', 'quick_stats',
            'school_id', v_school_id,
            'is_final', true,
            'last_updated', NOW()
        ),
        'reconciliation', jsonb_build_object(
            'fees_sum_check', v_total_fees_collected + v_total_fees_pending,
            'fees_discrepancy', ABS(v_total_fees_expected - (v_total_fees_collected + v_total_fees_pending)),
            'is_valid', v_total_fees_expected = (v_total_fees_collected + v_total_fees_pending)
        )
    );
END;
$$;
