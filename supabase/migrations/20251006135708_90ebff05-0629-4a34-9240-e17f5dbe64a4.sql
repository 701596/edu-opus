-- Create payment_audit table
CREATE TABLE IF NOT EXISTS public.payment_audit (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id),
  amount NUMERIC(10,2) NOT NULL,
  method TEXT NOT NULL,
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on payment_audit
ALTER TABLE public.payment_audit ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for payment_audit
CREATE POLICY "Allow all operations for authenticated users"
  ON public.payment_audit
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create reports table for monthly aggregations
CREATE TABLE IF NOT EXISTS public.reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  month_start DATE NOT NULL,
  total_income NUMERIC(12,2) DEFAULT 0,
  total_expense NUMERIC(12,2) DEFAULT 0,
  net NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(month_start)
);

-- Enable RLS on reports
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for reports
CREATE POLICY "Allow all operations for authenticated users"
  ON public.reports
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create function to recalc monthly report
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
  WHERE EXTRACT(YEAR FROM p.payment_date) = p_year 
    AND EXTRACT(MONTH FROM p.payment_date) = p_month
    OR EXTRACT(YEAR FROM e.expense_date) = p_year 
    AND EXTRACT(MONTH FROM e.expense_date) = p_month;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;