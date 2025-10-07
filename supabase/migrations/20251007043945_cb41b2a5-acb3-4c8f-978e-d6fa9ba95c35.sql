-- Add columns to students table for fee tracking
ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS total_fee NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS remaining_fee NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending';

-- Update existing students to set total_fee and remaining_fee from fee_amount
UPDATE public.students 
SET total_fee = COALESCE(fee_amount, 0),
    remaining_fee = COALESCE(fee_amount, 0)
WHERE total_fee = 0;

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_students_payment_status ON public.students(payment_status);

-- Function to calculate student's paid fees
CREATE OR REPLACE FUNCTION public.calculate_student_paid_fees(student_uuid UUID)
RETURNS NUMERIC AS $$
  SELECT COALESCE(SUM(amount), 0)
  FROM public.payments
  WHERE student_id = student_uuid;
$$ LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public;

-- Function to calculate student's remaining fees
CREATE OR REPLACE FUNCTION public.calculate_student_remaining_fees(student_uuid UUID)
RETURNS NUMERIC AS $$
  SELECT COALESCE(
    (SELECT fee_amount FROM public.students WHERE id = student_uuid) - 
    (SELECT public.calculate_student_paid_fees(student_uuid)),
    0
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public;

-- Trigger function to update student remaining_fee after payment
CREATE OR REPLACE FUNCTION public.update_student_remaining_fee()
RETURNS TRIGGER AS $$
DECLARE
  v_total_paid NUMERIC;
  v_total_fee NUMERIC;
  v_remaining NUMERIC;
BEGIN
  -- Get the student's total fee
  SELECT fee_amount INTO v_total_fee 
  FROM public.students 
  WHERE id = COALESCE(NEW.student_id, OLD.student_id);
  
  -- Calculate total paid for this student
  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
  FROM public.payments
  WHERE student_id = COALESCE(NEW.student_id, OLD.student_id);
  
  -- Calculate remaining fee
  v_remaining := v_total_fee - v_total_paid;
  
  -- Update student record
  UPDATE public.students
  SET 
    remaining_fee = v_remaining,
    payment_status = CASE 
      WHEN v_remaining <= 0 THEN 'paid'
      WHEN v_total_paid > 0 THEN 'partial'
      ELSE 'pending'
    END
  WHERE id = COALESCE(NEW.student_id, OLD.student_id);
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger on payments to update student remaining_fee
DROP TRIGGER IF EXISTS trg_update_student_fee ON public.payments;
CREATE TRIGGER trg_update_student_fee
AFTER INSERT OR UPDATE OR DELETE ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.update_student_remaining_fee();

-- Trigger function to auto-create expense from salary payment
CREATE OR REPLACE FUNCTION public.auto_create_salary_expense()
RETURNS TRIGGER AS $$
DECLARE
  v_staff_name TEXT;
BEGIN
  -- Get staff name
  SELECT name INTO v_staff_name
  FROM public.staff
  WHERE id = NEW.staff_id;
  
  -- Create corresponding expense record
  INSERT INTO public.expenses (
    expense_date,
    amount,
    category,
    description,
    vendor,
    receipt_number,
    currency
  ) VALUES (
    NEW.payment_date,
    NEW.net_amount,
    'Salary',
    'Salary payment for ' || v_staff_name || ' (Period: ' || NEW.pay_period_start || ' to ' || NEW.pay_period_end || ')',
    v_staff_name,
    'SAL-' || NEW.id::TEXT,
    COALESCE(NEW.currency, 'USD')
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger on salaries to create expense
DROP TRIGGER IF EXISTS trg_salary_to_expense ON public.salaries;
CREATE TRIGGER trg_salary_to_expense
AFTER INSERT ON public.salaries
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_salary_expense();

-- Update recalc_monthly_report to include salaries
CREATE OR REPLACE FUNCTION public.recalc_monthly_report(p_year INT, p_month INT)
RETURNS VOID AS $$
BEGIN
  -- Delete existing month record
  DELETE FROM public.reports
  WHERE EXTRACT(YEAR FROM month_start) = p_year
    AND EXTRACT(MONTH FROM month_start) = p_month;

  -- Insert new aggregated record
  INSERT INTO public.reports (month_start, total_income, total_expense, net)
  SELECT 
    DATE_TRUNC('month', make_date(p_year, p_month, 1))::DATE AS month_start,
    COALESCE(SUM(p.amount), 0),
    COALESCE(SUM(e.amount), 0),
    COALESCE(SUM(p.amount), 0) - COALESCE(SUM(e.amount), 0)
  FROM public.payments p
  FULL JOIN public.expenses e 
    ON EXTRACT(YEAR FROM p.payment_date) = EXTRACT(YEAR FROM e.expense_date)
    AND EXTRACT(MONTH FROM p.payment_date) = EXTRACT(MONTH FROM e.expense_date)
  WHERE (EXTRACT(YEAR FROM p.payment_date) = p_year AND EXTRACT(MONTH FROM p.payment_date) = p_month)
    OR (EXTRACT(YEAR FROM e.expense_date) = p_year AND EXTRACT(MONTH FROM e.expense_date) = p_month);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Add trigger for salaries to update monthly report
DROP TRIGGER IF EXISTS trg_update_report_on_salary ON public.salaries;
CREATE TRIGGER trg_update_report_on_salary
AFTER INSERT OR UPDATE OR DELETE ON public.salaries
FOR EACH ROW
EXECUTE FUNCTION public.update_monthly_report();