-- Fix the update_monthly_report function to handle different table columns
CREATE OR REPLACE FUNCTION public.update_monthly_report()
RETURNS TRIGGER AS $$
DECLARE
  v_year INT;
  v_month INT;
  v_date DATE;
BEGIN
  -- Determine the date based on which table triggered this
  IF TG_TABLE_NAME = 'payments' THEN
    v_date := COALESCE(NEW.payment_date, OLD.payment_date, now());
  ELSIF TG_TABLE_NAME = 'expenses' THEN
    v_date := COALESCE(NEW.expense_date, OLD.expense_date, now());
  ELSE
    v_date := now();
  END IF;
  
  v_year := EXTRACT(YEAR FROM v_date);
  v_month := EXTRACT(MONTH FROM v_date);
  
  PERFORM public.recalc_monthly_report(v_year, v_month);
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;