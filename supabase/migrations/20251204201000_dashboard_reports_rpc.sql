-- =============================================
-- MIGRATION: 10K Scalability - Dashboard & Reports RPCs
-- Version: 0.2.1 - Performance Optimization
-- =============================================
-- Creates server-side aggregation functions to replace
-- full-table fetches in Dashboard and Reports pages.
-- =============================================

BEGIN;

-- =============================================
-- MISSING INDEXES
-- =============================================
CREATE INDEX IF NOT EXISTS idx_students_remaining_fee 
  ON public.students(remaining_fee DESC) 
  WHERE remaining_fee > 0;

CREATE INDEX IF NOT EXISTS idx_fee_folders_user_id 
  ON public.fee_folders(user_id);

CREATE INDEX IF NOT EXISTS idx_fee_folders_status 
  ON public.fee_folders(status) 
  WHERE status != 'paid';

CREATE INDEX IF NOT EXISTS idx_staff_user_id 
  ON public.staff(user_id);

CREATE INDEX IF NOT EXISTS idx_staff_created_at 
  ON public.staff(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_salaries_user_id 
  ON public.salaries(user_id);

-- =============================================
-- FUNCTION: get_dashboard_summary()
-- =============================================
-- Returns aggregated dashboard metrics in a single call
-- instead of fetching all rows client-side.
CREATE OR REPLACE FUNCTION public.get_dashboard_summary()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id UUID;
  v_result JSON;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT json_build_object(
    -- Student metrics
    'total_students', (SELECT COUNT(*) FROM students WHERE user_id = v_user_id),
    'total_expected_fee', (SELECT COALESCE(SUM(expected_fee), 0) FROM students WHERE user_id = v_user_id),
    'total_paid_fee', (SELECT COALESCE(SUM(paid_fee), 0) FROM students WHERE user_id = v_user_id),
    'total_remaining_fee', (SELECT COALESCE(SUM(remaining_fee), 0) FROM students WHERE user_id = v_user_id),
    
    -- Staff metrics
    'total_staff', (SELECT COUNT(*) FROM staff WHERE user_id = v_user_id),
    'total_expected_salary', (SELECT COALESCE(SUM(expected_salary_expense), 0) FROM staff WHERE user_id = v_user_id),
    'total_paid_salary', (SELECT COALESCE(SUM(paid_salary), 0) FROM staff WHERE user_id = v_user_id),
    
    -- Payment totals (current month)
    'total_payments_amount', (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE user_id = v_user_id),
    
    -- Expense totals
    'total_expenses_amount', (SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE user_id = v_user_id),
    
    -- Recent payments (last 5)
    'recent_payments', (
      SELECT COALESCE(json_agg(p), '[]'::json)
      FROM (
        SELECT 
          p.id,
          p.amount,
          p.payment_date,
          p.payment_method,
          s.name as student_name
        FROM payments p
        LEFT JOIN students s ON p.student_id = s.id
        WHERE p.user_id = v_user_id
        ORDER BY p.payment_date DESC
        LIMIT 5
      ) p
    ),
    
    -- Pending fees (top 5 by remaining)
    'pending_fees', (
      SELECT COALESCE(json_agg(s), '[]'::json)
      FROM (
        SELECT 
          id,
          name,
          remaining_fee,
          expected_fee
        FROM students
        WHERE user_id = v_user_id
          AND remaining_fee > 0
        ORDER BY remaining_fee DESC
        LIMIT 5
      ) s
    ),
    
    -- Payment methods distribution
    'payment_methods', (
      SELECT COALESCE(json_agg(pm), '[]'::json)
      FROM (
        SELECT 
          payment_method,
          COUNT(*) as count,
          SUM(amount) as total_amount
        FROM payments
        WHERE user_id = v_user_id
        GROUP BY payment_method
      ) pm
    ),
    
    -- Monthly data (last 6 months)
    'monthly_data', (
      SELECT COALESCE(json_agg(m ORDER BY m.month_date), '[]'::json)
      FROM (
        SELECT 
          DATE_TRUNC('month', d.date)::date as month_date,
          TO_CHAR(DATE_TRUNC('month', d.date), 'Mon') as month_name,
          COALESCE((
            SELECT SUM(amount) FROM payments 
            WHERE user_id = v_user_id 
              AND DATE_TRUNC('month', payment_date) = DATE_TRUNC('month', d.date)
          ), 0) as income,
          COALESCE((
            SELECT SUM(amount) FROM expenses 
            WHERE user_id = v_user_id 
              AND DATE_TRUNC('month', expense_date) = DATE_TRUNC('month', d.date)
          ), 0) as expenses
        FROM generate_series(
          DATE_TRUNC('month', CURRENT_DATE - INTERVAL '5 months'),
          DATE_TRUNC('month', CURRENT_DATE),
          '1 month'
        ) d(date)
      ) m
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- =============================================
-- FUNCTION: get_report_summary()
-- =============================================
-- Returns aggregated report metrics in a single call
CREATE OR REPLACE FUNCTION public.get_report_summary()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id UUID;
  v_result JSON;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT json_build_object(
    -- Income (from students.paid_fee - authoritative source)
    'total_income', (SELECT COALESCE(SUM(paid_fee), 0) FROM students WHERE user_id = v_user_id),
    
    -- Expenses total
    'total_expenses', (SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE user_id = v_user_id),
    
    -- Salaries total
    'total_salaries', (SELECT COALESCE(SUM(net_amount), 0) FROM salaries WHERE user_id = v_user_id),
    
    -- Fee folders total
    'total_fee_folders', (SELECT COALESCE(SUM(amount_due), 0) FROM fee_folders WHERE user_id = v_user_id),
    
    -- Remaining fees
    'remaining_fees', (SELECT COALESCE(SUM(remaining_fee), 0) FROM students WHERE user_id = v_user_id),
    
    -- Expected salary expense
    'expected_salary_expense', (SELECT COALESCE(SUM(expected_salary_expense), 0) FROM staff WHERE user_id = v_user_id),
    
    -- Category expenses breakdown
    'category_expenses', (
      SELECT COALESCE(json_agg(ce), '[]'::json)
      FROM (
        SELECT 
          COALESCE(category, 'Other') as name,
          SUM(amount) as value
        FROM expenses
        WHERE user_id = v_user_id
        GROUP BY category
        ORDER BY SUM(amount) DESC
      ) ce
    ),
    
    -- Payment methods breakdown
    'payment_methods', (
      SELECT COALESCE(json_agg(pm), '[]'::json)
      FROM (
        SELECT 
          COALESCE(payment_method, 'Unknown') as name,
          COUNT(*) as value,
          SUM(amount) as amount
        FROM payments
        WHERE user_id = v_user_id
        GROUP BY payment_method
      ) pm
    ),
    
    -- Monthly trends (last 6 months)
    'monthly_trends', (
      SELECT COALESCE(json_agg(m ORDER BY m.month_date), '[]'::json)
      FROM (
        SELECT 
          DATE_TRUNC('month', d.date)::date as month_date,
          TO_CHAR(DATE_TRUNC('month', d.date), 'Mon') as month,
          COALESCE((
            SELECT SUM(amount) FROM payments 
            WHERE user_id = v_user_id 
              AND DATE_TRUNC('month', payment_date) = DATE_TRUNC('month', d.date)
          ), 0) as income,
          COALESCE((
            SELECT SUM(amount) FROM expenses 
            WHERE user_id = v_user_id 
              AND DATE_TRUNC('month', expense_date) = DATE_TRUNC('month', d.date)
          ), 0) as expenses,
          COALESCE((
            SELECT SUM(net_amount) FROM salaries 
            WHERE user_id = v_user_id 
              AND DATE_TRUNC('month', payment_date) = DATE_TRUNC('month', d.date)
          ), 0) as salaries
        FROM generate_series(
          DATE_TRUNC('month', CURRENT_DATE - INTERVAL '5 months'),
          DATE_TRUNC('month', CURRENT_DATE),
          '1 month'
        ) d(date)
      ) m
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- =============================================
-- GRANT PERMISSIONS
-- =============================================
GRANT EXECUTE ON FUNCTION public.get_dashboard_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_report_summary() TO authenticated;

COMMIT;

-- =============================================
-- VERIFICATION
-- =============================================
-- Test the functions:
-- SELECT get_dashboard_summary();
-- SELECT get_report_summary();
