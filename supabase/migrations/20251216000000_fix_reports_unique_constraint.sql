-- Migration: Fix reports table unique constraint for tenant isolation
-- Issue: "duplicate key value violates unique constraint reports_month_start_key"
-- Root cause: Unique constraint on month_start only, not scoped by user_id

-- Step 1: Drop the existing incorrect constraint
ALTER TABLE public.reports 
DROP CONSTRAINT IF EXISTS reports_month_start_key;

-- Step 2: Add correct tenant-scoped unique constraint (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'reports_user_month_unique'
    ) THEN
        ALTER TABLE public.reports 
        ADD CONSTRAINT reports_user_month_unique UNIQUE (user_id, month_start);
    END IF;
END $$;

-- Step 3: Update recalc_monthly_report function to use upsert
-- This ensures it won't fail on duplicate entries

CREATE OR REPLACE FUNCTION public.recalc_monthly_report(
    p_year INT,
    p_month INT,
    p_user_id UUID DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_month_start DATE;
    v_total_income NUMERIC;
    v_total_expense NUMERIC;
BEGIN
    -- Determine user_id
    v_user_id := COALESCE(p_user_id, auth.uid());
    
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'No user_id provided and no authenticated user';
    END IF;
    
    -- Calculate month start
    v_month_start := make_date(p_year, p_month, 1);
    
    -- Calculate total income (payments in this month for this user's students)
    SELECT COALESCE(SUM(p.amount), 0) INTO v_total_income
    FROM public.payments p
    INNER JOIN public.students s ON p.student_id = s.id
    WHERE s.user_id = v_user_id
      AND p.payment_date >= v_month_start
      AND p.payment_date < (v_month_start + INTERVAL '1 month');
    
    -- Calculate total expenses (for this user in this month)
    SELECT COALESCE(SUM(e.amount), 0) INTO v_total_expense
    FROM public.expenses e
    WHERE e.user_id = v_user_id
      AND e.expense_date >= v_month_start
      AND e.expense_date < (v_month_start + INTERVAL '1 month');
    
    -- Safe upsert: INSERT or UPDATE on conflict
    INSERT INTO public.reports (user_id, month_start, total_income, total_expense, net, created_at, updated_at)
    VALUES (
        v_user_id,
        v_month_start,
        v_total_income,
        v_total_expense,
        v_total_income - v_total_expense,
        NOW(),
        NOW()
    )
    ON CONFLICT (user_id, month_start) DO UPDATE SET
        total_income = EXCLUDED.total_income,
        total_expense = EXCLUDED.total_expense,
        net = EXCLUDED.net,
        updated_at = NOW();
        
END;
$$;

-- Step 4: Update any triggers that call this function to pass user_id
-- Find and update the trigger function that runs on student/payment changes

CREATE OR REPLACE FUNCTION public.update_monthly_report()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_date DATE;
BEGIN
    -- Determine the user_id and date based on the trigger operation
    IF TG_TABLE_NAME = 'students' THEN
        v_user_id := COALESCE(NEW.user_id, OLD.user_id);
        v_date := CURRENT_DATE;
    ELSIF TG_TABLE_NAME = 'payments' THEN
        -- Get user_id from the student
        SELECT s.user_id INTO v_user_id
        FROM public.students s
        WHERE s.id = COALESCE(NEW.student_id, OLD.student_id);
        v_date := COALESCE(NEW.payment_date, OLD.payment_date, CURRENT_DATE);
    ELSIF TG_TABLE_NAME = 'expenses' THEN
        v_user_id := COALESCE(NEW.user_id, OLD.user_id);
        v_date := COALESCE(NEW.expense_date, OLD.expense_date, CURRENT_DATE);
    ELSE
        -- Fallback
        v_user_id := auth.uid();
        v_date := CURRENT_DATE;
    END IF;
    
    -- Skip if no user_id found
    IF v_user_id IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;
    
    -- Call recalc with user_id
    PERFORM public.recalc_monthly_report(
        EXTRACT(YEAR FROM v_date)::INT,
        EXTRACT(MONTH FROM v_date)::INT,
        v_user_id
    );
    
    RETURN COALESCE(NEW, OLD);
EXCEPTION
    WHEN OTHERS THEN
        -- Log error but don't fail the main operation
        RAISE WARNING 'update_monthly_report failed: %', SQLERRM;
        RETURN COALESCE(NEW, OLD);
END;
$$;

-- Verification
SELECT 'Migration complete: reports_user_month_unique constraint added' AS status;
