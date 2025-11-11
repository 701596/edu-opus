-- Add expected_salary_expense and paid_salary columns to staff table
ALTER TABLE public.staff
ADD COLUMN IF NOT EXISTS expected_salary_expense NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS paid_salary NUMERIC DEFAULT 0;

-- Create function to calculate expected staff salary expense
CREATE OR REPLACE FUNCTION public.calculate_expected_staff_expense(
  p_join_date DATE,
  p_salary NUMERIC,
  p_salary_type TEXT,
  p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_months_elapsed INT;
  v_years_elapsed INT;
  v_remaining_months INT;
  v_expected_expense NUMERIC;
  v_join_day INT;
BEGIN
  -- Handle null inputs
  IF p_join_date IS NULL OR p_salary IS NULL OR p_salary_type IS NULL THEN
    RETURN 0;
  END IF;
  
  -- Don't calculate for future join dates
  IF p_join_date > p_as_of_date THEN
    RETURN 0;
  END IF;
  
  -- Calculate months elapsed
  v_months_elapsed := (EXTRACT(YEAR FROM p_as_of_date) - EXTRACT(YEAR FROM p_join_date)) * 12 
                     + (EXTRACT(MONTH FROM p_as_of_date) - EXTRACT(MONTH FROM p_join_date));
  
  -- Check if joined on day 1 of the month
  v_join_day := EXTRACT(DAY FROM p_join_date);
  IF v_join_day = 1 THEN
    v_months_elapsed := v_months_elapsed + 1;
  ELSIF EXTRACT(DAY FROM p_as_of_date) >= v_join_day THEN
    v_months_elapsed := v_months_elapsed + 1;
  END IF;
  
  -- Ensure non-negative
  IF v_months_elapsed < 0 THEN
    v_months_elapsed := 0;
  END IF;
  
  -- Calculate expected expense based on salary_type
  IF p_salary_type = 'monthly' THEN
    v_expected_expense := p_salary * v_months_elapsed;
  ELSIF p_salary_type = 'annual' THEN
    v_years_elapsed := FLOOR(v_months_elapsed / 12);
    v_remaining_months := v_months_elapsed % 12;
    v_expected_expense := (p_salary * v_years_elapsed) + (p_salary * v_remaining_months / 12);
  ELSE
    -- Default to monthly
    v_expected_expense := p_salary * v_months_elapsed;
  END IF;
  
  -- Round to 2 decimal places
  RETURN ROUND(v_expected_expense, 2);
END;
$$;

-- Create trigger function to recalculate staff salary fields on update
CREATE OR REPLACE FUNCTION public.recalculate_staff_salary_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Calculate expected_salary_expense using the authoritative function
  NEW.expected_salary_expense := public.calculate_expected_staff_expense(
    NEW.join_date,
    NEW.salary,
    NEW.salary_type,
    CURRENT_DATE
  );
  
  -- Get paid_salary from salaries table
  SELECT COALESCE(SUM(net_amount), 0) INTO NEW.paid_salary
  FROM public.salaries
  WHERE staff_id = NEW.id;
  
  RETURN NEW;
END;
$$;

-- Create trigger to run on INSERT or UPDATE of staff
DROP TRIGGER IF EXISTS trigger_recalculate_staff_salary_fields ON public.staff;
CREATE TRIGGER trigger_recalculate_staff_salary_fields
  BEFORE INSERT OR UPDATE OF salary, salary_type, join_date
  ON public.staff
  FOR EACH ROW
  EXECUTE FUNCTION public.recalculate_staff_salary_fields();

-- Create trigger function to update staff salaries when payment changes
CREATE OR REPLACE FUNCTION public.update_staff_salaries_on_payment_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id UUID;
  v_paid_salary NUMERIC;
  v_expected_expense NUMERIC;
BEGIN
  -- Get the affected staff_id
  v_staff_id := COALESCE(NEW.staff_id, OLD.staff_id);
  
  -- Calculate total paid for this staff member
  SELECT COALESCE(SUM(net_amount), 0) INTO v_paid_salary
  FROM public.salaries
  WHERE staff_id = v_staff_id;
  
  -- Get expected expense for this staff member
  SELECT expected_salary_expense INTO v_expected_expense
  FROM public.staff
  WHERE id = v_staff_id;
  
  -- Update staff record
  UPDATE public.staff
  SET 
    paid_salary = v_paid_salary,
    updated_at = now()
  WHERE id = v_staff_id;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- Create trigger on salaries table
DROP TRIGGER IF EXISTS trigger_update_staff_on_salary_change ON public.salaries;
CREATE TRIGGER trigger_update_staff_on_salary_change
  AFTER INSERT OR UPDATE OR DELETE
  ON public.salaries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_staff_salaries_on_payment_change();

-- Create audit table for staff salary changes
CREATE TABLE IF NOT EXISTS public.staff_salary_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL,
  actor_id UUID,
  changed_fields JSONB,
  old_values JSONB,
  new_values JSONB,
  calculation_timestamp TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on staff_salary_audit
ALTER TABLE public.staff_salary_audit ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for staff_salary_audit
CREATE POLICY "Users can view their own staff salary audit logs"
  ON public.staff_salary_audit
  FOR SELECT
  USING (actor_id = auth.uid());

-- Create trigger function to log staff salary changes
CREATE OR REPLACE FUNCTION public.log_staff_salary_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only log on UPDATE where salary fields changed
  IF TG_OP = 'UPDATE' AND (
    OLD.salary IS DISTINCT FROM NEW.salary OR
    OLD.salary_type IS DISTINCT FROM NEW.salary_type OR
    OLD.join_date IS DISTINCT FROM NEW.join_date OR
    OLD.expected_salary_expense IS DISTINCT FROM NEW.expected_salary_expense
  ) THEN
    INSERT INTO public.staff_salary_audit (
      staff_id,
      actor_id,
      changed_fields,
      old_values,
      new_values
    ) VALUES (
      NEW.id,
      auth.uid(),
      jsonb_build_object(
        'salary', (OLD.salary IS DISTINCT FROM NEW.salary),
        'salary_type', (OLD.salary_type IS DISTINCT FROM NEW.salary_type),
        'join_date', (OLD.join_date IS DISTINCT FROM NEW.join_date)
      ),
      jsonb_build_object(
        'salary', OLD.salary,
        'salary_type', OLD.salary_type,
        'join_date', OLD.join_date,
        'expected_salary_expense', OLD.expected_salary_expense
      ),
      jsonb_build_object(
        'salary', NEW.salary,
        'salary_type', NEW.salary_type,
        'join_date', NEW.join_date,
        'expected_salary_expense', NEW.expected_salary_expense
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to log staff salary changes
DROP TRIGGER IF EXISTS trigger_log_staff_salary_change ON public.staff;
CREATE TRIGGER trigger_log_staff_salary_change
  AFTER UPDATE
  ON public.staff
  FOR EACH ROW
  EXECUTE FUNCTION public.log_staff_salary_change();

-- Backfill expected_salary_expense and paid_salary for existing staff
UPDATE public.staff
SET 
  expected_salary_expense = public.calculate_expected_staff_expense(
    join_date,
    salary,
    salary_type,
    CURRENT_DATE
  ),
  paid_salary = COALESCE((
    SELECT SUM(net_amount)
    FROM public.salaries
    WHERE salaries.staff_id = staff.id
  ), 0)
WHERE expected_salary_expense IS NULL OR expected_salary_expense = 0;