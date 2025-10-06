-- Trigger function to auto-insert into payment_audit
CREATE OR REPLACE FUNCTION public.log_payment_audit()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.payment_audit (payment_id, student_id, amount, method)
  VALUES (NEW.id, NEW.student_id, NEW.amount, NEW.payment_method);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger on payments insert
CREATE TRIGGER trg_log_payment_audit
AFTER INSERT ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.log_payment_audit();

-- Trigger function to auto-update monthly report
CREATE OR REPLACE FUNCTION public.update_monthly_report()
RETURNS TRIGGER AS $$
DECLARE
  v_year INT := EXTRACT(YEAR FROM COALESCE(NEW.payment_date, NEW.expense_date, now()));
  v_month INT := EXTRACT(MONTH FROM COALESCE(NEW.payment_date, NEW.expense_date, now()));
BEGIN
  PERFORM public.recalc_monthly_report(v_year, v_month);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger on payments insert/update/delete
CREATE TRIGGER trg_update_report_on_payment
AFTER INSERT OR UPDATE OR DELETE ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.update_monthly_report();

-- Trigger on expenses insert/update/delete
CREATE TRIGGER trg_update_report_on_expense
AFTER INSERT OR UPDATE OR DELETE ON public.expenses
FOR EACH ROW
EXECUTE FUNCTION public.update_monthly_report();