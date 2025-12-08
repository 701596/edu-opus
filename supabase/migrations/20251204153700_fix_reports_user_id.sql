-- =============================================
-- FIX: Reports Table user_id Multi-Tenancy Issue
-- =============================================
-- This migration fixes the critical issue where reports.user_id
-- was NULL, breaking multi-tenancy and causing constraint violations.
--
-- Changes:
-- 1. Make user_id NOT NULL (after backfill)
-- 2. Backfill existing reports with user_id from related payments
-- 3. Update recalc_monthly_report() to accept and use user_id
-- 4. Update update_monthly_report() to pass user_id
-- 5. Add index for performance
-- 6. Ensure RLS policies are correct

BEGIN;

-- =============================================
-- STEP 1: Backfill existing reports with user_id
-- =============================================
-- Strategy: Get user_id from payments in the same month
-- If no payments exist for that month, get from expenses
-- If neither exists, the report is orphaned and will be deleted

DO $$
DECLARE
  report_record RECORD;
  found_user_id UUID;
BEGIN
  -- Loop through all reports with NULL user_id
  FOR report_record IN 
    SELECT id, month_start 
    FROM public.reports 
    WHERE user_id IS NULL
  LOOP
    -- Try to get user_id from payments for this month
    SELECT user_id INTO found_user_id
    FROM public.payments
    WHERE EXTRACT(YEAR FROM payment_date) = EXTRACT(YEAR FROM report_record.month_start)
      AND EXTRACT(MONTH FROM payment_date) = EXTRACT(MONTH FROM report_record.month_start)
      AND user_id IS NOT NULL
    LIMIT 1;

    -- If no payment found, try expenses
    IF found_user_id IS NULL THEN
      SELECT user_id INTO found_user_id
      FROM public.expenses
      WHERE EXTRACT(YEAR FROM expense_date) = EXTRACT(YEAR FROM report_record.month_start)
        AND EXTRACT(MONTH FROM expense_date) = EXTRACT(MONTH FROM report_record.month_start)
        AND user_id IS NOT NULL
      LIMIT 1;
    END IF;

    -- If we found a user_id, update the report
    IF found_user_id IS NOT NULL THEN
      UPDATE public.reports
      SET user_id = found_user_id
      WHERE id = report_record.id;
      
      RAISE NOTICE 'Updated report % with user_id %', report_record.id, found_user_id;
    ELSE
      -- If no user_id found, delete the orphaned report
      DELETE FROM public.reports WHERE id = report_record.id;
      RAISE NOTICE 'Deleted orphaned report % (no related payments/expenses)', report_record.id;
    END IF;
  END LOOP;
END $$;

-- =============================================
-- STEP 2: Make user_id NOT NULL
-- =============================================
-- This will fail if any NULL values remain (which shouldn't happen after backfill)
ALTER TABLE public.reports 
  ALTER COLUMN user_id SET NOT NULL;

-- =============================================
-- STEP 3: Add index for performance
-- =============================================
CREATE INDEX IF NOT EXISTS idx_reports_user_id 
  ON public.reports(user_id);

CREATE INDEX IF NOT EXISTS idx_reports_user_id_month 
  ON public.reports(user_id, month_start DESC);

-- =============================================
-- STEP 4: Update recalc_monthly_report function
-- =============================================
-- Now accepts user_id parameter and uses it in INSERT
CREATE OR REPLACE FUNCTION public.recalc_monthly_report(
  p_year INTEGER, 
  p_month INTEGER, 
  p_user_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_month_start DATE;
  v_total_income NUMERIC;
  v_total_expense NUMERIC;
  v_net NUMERIC;
BEGIN
  v_month_start := DATE_TRUNC('month', make_date(p_year, p_month, 1))::DATE;
  
  -- Calculate total income from payments (for this user only)
  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_income
  FROM public.payments
  WHERE EXTRACT(YEAR FROM payment_date) = p_year
    AND EXTRACT(MONTH FROM payment_date) = p_month
    AND user_id = p_user_id;
  
  -- Calculate total expenses (for this user only)
  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_expense
  FROM public.expenses
  WHERE EXTRACT(YEAR FROM expense_date) = p_year
    AND EXTRACT(MONTH FROM expense_date) = p_month
    AND user_id = p_user_id;
  
  -- Calculate net
  v_net := v_total_income - v_total_expense;
  
  -- Delete existing record for this month and user
  DELETE FROM public.reports
  WHERE month_start = v_month_start
    AND user_id = p_user_id;
  
  -- Insert new aggregated record with user_id
  INSERT INTO public.reports (month_start, total_income, total_expense, net, user_id)
  VALUES (v_month_start, v_total_income, v_total_expense, v_net, p_user_id);
END;
$function$;

-- =============================================
-- STEP 5: Update update_monthly_report trigger
-- =============================================
-- Now passes user_id to recalc_monthly_report
CREATE OR REPLACE FUNCTION public.update_monthly_report()
RETURNS TRIGGER AS $$
DECLARE
  v_year INT;
  v_month INT;
  v_date DATE;
  v_user_id UUID;
BEGIN
  -- Determine the date based on which table triggered this
  IF TG_TABLE_NAME = 'payments' THEN
    v_date := COALESCE(NEW.payment_date, OLD.payment_date, now());
    v_user_id := COALESCE(NEW.user_id, OLD.user_id);
  ELSIF TG_TABLE_NAME = 'expenses' THEN
    v_date := COALESCE(NEW.expense_date, OLD.expense_date, now());
    v_user_id := COALESCE(NEW.user_id, OLD.user_id);
  ELSE
    v_date := now();
    v_user_id := auth.uid();
  END IF;
  
  v_year := EXTRACT(YEAR FROM v_date);
  v_month := EXTRACT(MONTH FROM v_date);
  
  -- Call recalc_monthly_report with user_id
  PERFORM public.recalc_monthly_report(v_year, v_month, v_user_id);
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================
-- STEP 6: Ensure RLS is properly configured
-- =============================================
-- Re-apply RLS policy (should already exist, but ensuring it's correct)
DROP POLICY IF EXISTS "Users can only access their own reports" ON public.reports;
CREATE POLICY "Users can only access their own reports"
  ON public.reports
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Ensure RLS is enabled
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

COMMIT;

-- =============================================
-- VERIFICATION QUERIES (Run these after migration)
-- =============================================
-- 1. Check all reports have user_id:
--    SELECT COUNT(*) FROM public.reports WHERE user_id IS NULL;
--    Expected: 0
--
-- 2. Check indexes exist:
--    SELECT indexname FROM pg_indexes WHERE tablename = 'reports';
--    Expected: idx_reports_user_id, idx_reports_user_id_month
--
-- 3. Test function works:
--    SELECT recalc_monthly_report(2024, 12, auth.uid());
--    Expected: No errors
