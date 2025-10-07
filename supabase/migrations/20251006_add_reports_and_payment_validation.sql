-- Create reports table for monthly summaries
CREATE TABLE IF NOT EXISTS public.reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  year INT NOT NULL,
  month INT NOT NULL,
  total_income NUMERIC DEFAULT 0,
  total_salaries NUMERIC DEFAULT 0,
  other_expenses NUMERIC DEFAULT 0,
  total_expenses NUMERIC DEFAULT 0,
  profit NUMERIC DEFAULT 0,
  generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (year, month)
);

-- Function: recalculate monthly report for a specific year+month
CREATE OR REPLACE FUNCTION public.recalc_monthly_report(p_year INT, p_month INT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start DATE := make_date(p_year, p_month, 1);
  v_end DATE := (v_start + INTERVAL '1 month')::date;
  v_total_income NUMERIC := 0;
  v_total_salaries NUMERIC := 0;
  v_other_expenses NUMERIC := 0;
  v_total_expenses NUMERIC := 0;
BEGIN
  -- Sum payments in month
  SELECT COALESCE(SUM(amount),0) INTO v_total_income
  FROM public.payments
  WHERE payment_date >= v_start AND payment_date < v_end;

  -- Sum salaries in month (from salaries table)
  SELECT COALESCE(SUM(net_amount),0) INTO v_total_salaries
  FROM public.salaries
  WHERE payment_date >= v_start AND payment_date < v_end;

  -- Sum other expenses in month (exclude salary category to avoid double-count)
  SELECT COALESCE(SUM(amount),0) INTO v_other_expenses
  FROM public.expenses
  WHERE expense_date >= v_start AND expense_date < v_end
    AND (category IS NULL OR category != 'Salary');

  v_total_expenses := v_total_salaries + v_other_expenses;

  -- Upsert report row
  INSERT INTO public.reports (year, month, total_income, total_salaries, other_expenses, total_expenses, profit, generated_at, updated_at)
  VALUES (p_year, p_month, v_total_income, v_total_salaries, v_other_expenses, v_total_expenses, (v_total_income - v_total_expenses), now(), now())
  ON CONFLICT (year, month) DO UPDATE
  SET total_income = EXCLUDED.total_income,
      total_salaries = EXCLUDED.total_salaries,
      other_expenses = EXCLUDED.other_expenses,
      total_expenses = EXCLUDED.total_expenses,
      profit = EXCLUDED.profit,
      updated_at = now();
END;
$$;

-- Trigger function to call recalc_monthly_report after changes to payments, expenses or salaries
CREATE OR REPLACE FUNCTION public.update_monthly_report_on_financial_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date DATE;
  v_year INT;
  v_month INT;
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF TG_TABLE_NAME = 'payments' THEN
      v_date := NEW.payment_date::date;
    ELSIF TG_TABLE_NAME = 'expenses' THEN
      v_date := NEW.expense_date::date;
    ELSIF TG_TABLE_NAME = 'salaries' THEN
      v_date := NEW.payment_date::date;
    ELSE
      RETURN NEW;
    END IF;

    v_year := EXTRACT(YEAR FROM v_date)::int;
    v_month := EXTRACT(MONTH FROM v_date)::int;

    PERFORM public.recalc_monthly_report(v_year, v_month);
  END IF;

  RETURN NEW;
END;
$$;

-- Attach triggers for payments, expenses and salaries (after insert/update)
DROP TRIGGER IF EXISTS trigger_update_monthly_report_on_payments ON public.payments;
CREATE TRIGGER trigger_update_monthly_report_on_payments
  AFTER INSERT OR UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_monthly_report_on_financial_change();

DROP TRIGGER IF EXISTS trigger_update_monthly_report_on_expenses ON public.expenses;
CREATE TRIGGER trigger_update_monthly_report_on_expenses
  AFTER INSERT OR UPDATE ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_monthly_report_on_financial_change();

DROP TRIGGER IF EXISTS trigger_update_monthly_report_on_salaries ON public.salaries;
CREATE TRIGGER trigger_update_monthly_report_on_salaries
  AFTER INSERT OR UPDATE ON public.salaries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_monthly_report_on_financial_change();

-- Payment validation: ensure payment does not exceed remaining due for earliest unpaid fee folder
CREATE OR REPLACE FUNCTION public.validate_payment_amount()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fee RECORD;
  v_remaining NUMERIC;
BEGIN
  -- Find earliest non-paid fee folder for this student
  SELECT * INTO v_fee
  FROM public.fee_folders
  WHERE student_id = NEW.student_id
    AND status != 'paid'
  ORDER BY due_date ASC
  LIMIT 1;

  IF v_fee.id IS NULL THEN
    -- No fee folder found; allow payment but do not validate
    RETURN NEW;
  END IF;

  v_remaining := v_fee.amount_due - COALESCE(v_fee.amount_paid, 0);

  IF NEW.amount > v_remaining THEN
    RAISE EXCEPTION 'Payment amount (%%) exceeds remaining fee (%%) for student %%', NEW.amount, v_remaining, NEW.student_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Attach validation trigger BEFORE INSERT on payments
DROP TRIGGER IF EXISTS trigger_validate_payment_amount ON public.payments;
CREATE TRIGGER trigger_validate_payment_amount
  BEFORE INSERT ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_payment_amount();

-- Index for reports lookup
CREATE INDEX IF NOT EXISTS idx_reports_year_month ON public.reports(year, month);
