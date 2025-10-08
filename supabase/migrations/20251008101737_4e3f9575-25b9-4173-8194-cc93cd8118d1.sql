-- =============================================
-- COMPREHENSIVE STUDENT & STAFF AUTOMATION
-- =============================================

-- 1. Add "School Fee" category to fee_folders (if not exists)
-- This is a data insert, so we'll handle it with a check first
DO $$
BEGIN
  -- No specific enum for categories, so we just document it for app use
  -- The app will use "School Fee" as one of the selectable categories
END $$;

-- 2. Trigger: Auto-calculate student total_fee and remaining_fee on INSERT
CREATE OR REPLACE FUNCTION public.auto_init_student_fees()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Set total_fee based on fee_amount and fee_type
  -- For monthly: multiply by 12, for annually: use as-is
  IF NEW.fee_type = 'monthly' THEN
    NEW.total_fee := NEW.fee_amount * 12;
  ELSE
    NEW.total_fee := NEW.fee_amount;
  END IF;
  
  -- Initially, remaining_fee equals total_fee (no payments yet)
  NEW.remaining_fee := NEW.total_fee;
  
  -- Set initial payment status
  NEW.payment_status := 'pending';
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_init_student_fees ON public.students;
CREATE TRIGGER trg_auto_init_student_fees
  BEFORE INSERT ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_init_student_fees();

-- 3. Update existing trigger function to handle student fee updates more comprehensively
CREATE OR REPLACE FUNCTION public.update_student_remaining_fee()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total_paid NUMERIC;
  v_total_fee NUMERIC;
  v_remaining NUMERIC;
  v_student_id UUID;
BEGIN
  -- Determine which student_id to use
  v_student_id := COALESCE(NEW.student_id, OLD.student_id);
  
  -- Get the student's total fee
  SELECT total_fee INTO v_total_fee 
  FROM public.students 
  WHERE id = v_student_id;
  
  -- If total_fee is NULL or 0, recalculate from fee_amount
  IF v_total_fee IS NULL OR v_total_fee = 0 THEN
    SELECT 
      CASE 
        WHEN fee_type = 'monthly' THEN fee_amount * 12
        ELSE fee_amount
      END
    INTO v_total_fee
    FROM public.students
    WHERE id = v_student_id;
    
    -- Update total_fee in students table
    UPDATE public.students
    SET total_fee = v_total_fee
    WHERE id = v_student_id;
  END IF;
  
  -- Calculate total paid for this student
  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
  FROM public.payments
  WHERE student_id = v_student_id;
  
  -- Calculate remaining fee
  v_remaining := COALESCE(v_total_fee, 0) - v_total_paid;
  
  -- Update student record
  UPDATE public.students
  SET 
    remaining_fee = v_remaining,
    payment_status = CASE 
      WHEN v_remaining <= 0 THEN 'paid'
      WHEN v_total_paid > 0 THEN 'partial'
      ELSE 'pending'
    END,
    updated_at = now()
  WHERE id = v_student_id;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- Ensure the trigger exists (it should from previous migration)
DROP TRIGGER IF EXISTS trg_update_student_fee ON public.payments;
CREATE TRIGGER trg_update_student_fee
  AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_student_remaining_fee();

-- 4. Trigger: Auto-create expense when staff is added
-- Based on salary, salary_type, and join_date
CREATE OR REPLACE FUNCTION public.auto_create_staff_expense()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_months_worked INT;
  v_expense_amount NUMERIC;
  v_current_date DATE := CURRENT_DATE;
BEGIN
  -- Calculate how many months the staff has worked from join_date to now
  v_months_worked := EXTRACT(YEAR FROM AGE(v_current_date, NEW.join_date)) * 12 + 
                     EXTRACT(MONTH FROM AGE(v_current_date, NEW.join_date));
  
  -- Only create expense if they've worked at least part of current month
  IF v_months_worked < 0 THEN
    v_months_worked := 0;
  END IF;
  
  -- Calculate the expense amount based on salary type
  IF NEW.salary_type = 'monthly' THEN
    -- For monthly salary, create an expense for current month
    v_expense_amount := NEW.salary;
  ELSE
    -- For annual salary, calculate monthly equivalent
    v_expense_amount := NEW.salary / 12;
  END IF;
  
  -- Insert into expenses table (for current month's salary)
  INSERT INTO public.expenses (
    expense_date,
    amount,
    category,
    description,
    vendor,
    receipt_number,
    currency
  ) VALUES (
    v_current_date,
    v_expense_amount,
    'Salary',
    'Initial salary expense for ' || NEW.name || ' (Position: ' || NEW.position || ')',
    NEW.name,
    'STF-EXP-' || NEW.id::TEXT,
    'USD'
  );
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_create_staff_expense ON public.staff;
CREATE TRIGGER trg_auto_create_staff_expense
  AFTER INSERT ON public.staff
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_staff_expense();

-- 5. Update recalc_monthly_report to be more comprehensive
CREATE OR REPLACE FUNCTION public.recalc_monthly_report(p_year integer, p_month integer)
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
  
  -- Calculate total income from payments
  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_income
  FROM public.payments
  WHERE EXTRACT(YEAR FROM payment_date) = p_year
    AND EXTRACT(MONTH FROM payment_date) = p_month;
  
  -- Calculate total expenses (includes all expenses and salaries)
  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_expense
  FROM public.expenses
  WHERE EXTRACT(YEAR FROM expense_date) = p_year
    AND EXTRACT(MONTH FROM expense_date) = p_month;
  
  -- Calculate net
  v_net := v_total_income - v_total_expense;
  
  -- Delete existing record for this month
  DELETE FROM public.reports
  WHERE month_start = v_month_start;
  
  -- Insert new aggregated record
  INSERT INTO public.reports (month_start, total_income, total_expense, net)
  VALUES (v_month_start, v_total_income, v_total_expense, v_net);
END;
$function$;