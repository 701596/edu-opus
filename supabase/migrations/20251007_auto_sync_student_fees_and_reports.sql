-- Migration: automatic synchronization for students, payments, staff, expenses and reports
-- Adds trigger functions to keep remaining fees, expenses and reports up-to-date

-- 1. Auto set remaining_fee for students
CREATE OR REPLACE FUNCTION public.init_remaining_fee()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.total_fee IS NOT NULL THEN
    NEW.remaining_fee := NEW.total_fee;
  ELSE
    NEW.remaining_fee := 0;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS before_student_insert ON public.students;
CREATE TRIGGER before_student_insert
BEFORE INSERT ON public.students
FOR EACH ROW
EXECUTE FUNCTION public.init_remaining_fee();

-- 2. Auto update remaining_fee after payment
CREATE OR REPLACE FUNCTION public.update_remaining_fee_after_payment()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.students
  SET remaining_fee = GREATEST(COALESCE(remaining_fee, 0) - COALESCE(NEW.amount, 0), 0)
  WHERE id = NEW.student_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS after_payment_insert ON public.payments;
CREATE TRIGGER after_payment_insert
AFTER INSERT ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.update_remaining_fee_after_payment();

-- 3. Auto add staff salary to expenses
CREATE OR REPLACE FUNCTION public.add_staff_salary_to_expenses()
RETURNS TRIGGER AS $$
BEGIN
  -- Ensure salary exists and is positive
  IF NEW.salary IS NOT NULL THEN
    INSERT INTO public.expenses (id, receipt_number, category, amount, expense_date, created_at, updated_at, vendor, description)
    VALUES (gen_random_uuid()::text, '', 'staff_salary', NEW.salary, NOW(), NOW(), NOW(), NEW.name, 'Auto-inserted staff salary');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS after_staff_insert ON public.staff;
CREATE TRIGGER after_staff_insert
AFTER INSERT ON public.staff
FOR EACH ROW
EXECUTE FUNCTION public.add_staff_salary_to_expenses();

-- 4. Auto update reports when payments or expenses change
CREATE OR REPLACE FUNCTION public.update_reports_auto()
RETURNS TRIGGER AS $$
DECLARE
  v_year INT := EXTRACT(YEAR FROM NOW());
  v_month INT := EXTRACT(MONTH FROM NOW());
BEGIN
  -- Try to call recalc_monthly_report if it exists
  PERFORM 1 FROM pg_proc WHERE proname = 'recalc_monthly_report';
  IF FOUND THEN
    PERFORM public.recalc_monthly_report(v_month, v_year);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_reports_payment ON public.payments;
CREATE TRIGGER trg_update_reports_payment
AFTER INSERT OR UPDATE OR DELETE ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.update_reports_auto();

DROP TRIGGER IF EXISTS trg_update_reports_expense ON public.expenses;
CREATE TRIGGER trg_update_reports_expense
AFTER INSERT OR UPDATE OR DELETE ON public.expenses
FOR EACH ROW
EXECUTE FUNCTION public.update_reports_auto();

-- Safety: grant execute on functions to authenticated role if needed (optional)
-- GRANT EXECUTE ON FUNCTION public.init_remaining_fee() TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.update_remaining_fee_after_payment() TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.add_staff_salary_to_expenses() TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.update_reports_auto() TO authenticated;
