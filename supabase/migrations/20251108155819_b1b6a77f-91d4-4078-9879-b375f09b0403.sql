-- Add expected_fee and paid_fee columns if they don't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'students' AND column_name = 'expected_fee') THEN
    ALTER TABLE public.students ADD COLUMN expected_fee NUMERIC DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'students' AND column_name = 'paid_fee') THEN
    ALTER TABLE public.students ADD COLUMN paid_fee NUMERIC DEFAULT 0;
  END IF;
END $$;

-- Create the authoritative fee calculation function
CREATE OR REPLACE FUNCTION public.calculate_expected_fee(
  p_join_date DATE,
  p_fee_amount NUMERIC,
  p_fee_type TEXT,
  p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  v_months_elapsed INT;
  v_years_elapsed INT;
  v_remaining_months INT;
  v_expected_fee NUMERIC;
  v_days_in_join_month INT;
  v_join_day INT;
BEGIN
  -- Handle null inputs
  IF p_join_date IS NULL OR p_fee_amount IS NULL OR p_fee_type IS NULL THEN
    RETURN 0;
  END IF;
  
  -- Don't calculate negative fees for future join dates
  IF p_join_date > p_as_of_date THEN
    RETURN 0;
  END IF;
  
  -- Calculate months elapsed
  v_months_elapsed := (EXTRACT(YEAR FROM p_as_of_date) - EXTRACT(YEAR FROM p_join_date)) * 12 
                     + (EXTRACT(MONTH FROM p_as_of_date) - EXTRACT(MONTH FROM p_join_date));
  
  -- Check if joined on day 1 of the month, if so count that month
  v_join_day := EXTRACT(DAY FROM p_join_date);
  IF v_join_day = 1 THEN
    v_months_elapsed := v_months_elapsed + 1;
  ELSIF EXTRACT(DAY FROM p_as_of_date) >= v_join_day THEN
    -- Count partial month if we've passed the join day in the current month
    v_months_elapsed := v_months_elapsed + 1;
  END IF;
  
  -- Ensure non-negative
  IF v_months_elapsed < 0 THEN
    v_months_elapsed := 0;
  END IF;
  
  -- Calculate expected fee based on fee_type
  IF p_fee_type = 'monthly' THEN
    v_expected_fee := p_fee_amount * v_months_elapsed;
  ELSIF p_fee_type = 'annual' THEN
    v_years_elapsed := FLOOR(v_months_elapsed / 12);
    v_remaining_months := v_months_elapsed % 12;
    -- Prorate partial year
    v_expected_fee := (p_fee_amount * v_years_elapsed) + (p_fee_amount * v_remaining_months / 12);
  ELSE
    -- Default to monthly if unknown type
    v_expected_fee := p_fee_amount * v_months_elapsed;
  END IF;
  
  -- Round to 2 decimal places
  RETURN ROUND(v_expected_fee, 2);
END;
$function$;

-- Create function to recalculate all student fees
CREATE OR REPLACE FUNCTION public.recalculate_student_fee_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Calculate expected_fee using the authoritative function
  NEW.expected_fee := public.calculate_expected_fee(
    NEW.join_date,
    NEW.fee_amount,
    NEW.fee_type,
    CURRENT_DATE
  );
  
  -- Get paid_fee from payments
  SELECT COALESCE(SUM(amount), 0) INTO NEW.paid_fee
  FROM public.payments
  WHERE student_id = NEW.id;
  
  -- Calculate remaining_fee
  NEW.remaining_fee := NEW.expected_fee - NEW.paid_fee;
  
  -- Also update total_fee for backwards compatibility
  IF NEW.fee_type = 'monthly' THEN
    NEW.total_fee := NEW.fee_amount * 12;
  ELSE
    NEW.total_fee := NEW.fee_amount;
  END IF;
  
  -- Update payment status
  NEW.payment_status := CASE 
    WHEN NEW.remaining_fee <= 0 THEN 'paid'
    WHEN NEW.paid_fee > 0 THEN 'partial'
    ELSE 'pending'
  END;
  
  RETURN NEW;
END;
$function$;

-- Drop old trigger and create new one
DROP TRIGGER IF EXISTS recalculate_fees_on_student_update ON public.students;
DROP TRIGGER IF EXISTS recalculate_student_fees_on_update ON public.students;
DROP TRIGGER IF EXISTS auto_init_student_fees_trigger ON public.students;

CREATE TRIGGER recalculate_student_fee_fields_trigger
  BEFORE INSERT OR UPDATE ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.recalculate_student_fee_fields();

-- Create function to update student fees when payments change
CREATE OR REPLACE FUNCTION public.update_student_fees_on_payment_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_student_id UUID;
  v_paid_fee NUMERIC;
  v_expected_fee NUMERIC;
BEGIN
  -- Get the affected student_id
  v_student_id := COALESCE(NEW.student_id, OLD.student_id);
  
  -- Calculate total paid for this student
  SELECT COALESCE(SUM(amount), 0) INTO v_paid_fee
  FROM public.payments
  WHERE student_id = v_student_id;
  
  -- Get expected fee for this student
  SELECT expected_fee INTO v_expected_fee
  FROM public.students
  WHERE id = v_student_id;
  
  -- Update student record
  UPDATE public.students
  SET 
    paid_fee = v_paid_fee,
    remaining_fee = COALESCE(v_expected_fee, 0) - v_paid_fee,
    payment_status = CASE 
      WHEN (COALESCE(v_expected_fee, 0) - v_paid_fee) <= 0 THEN 'paid'
      WHEN v_paid_fee > 0 THEN 'partial'
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
$function$;

-- Drop old trigger and create new one for payments
DROP TRIGGER IF EXISTS update_student_remaining_fee ON public.payments;

CREATE TRIGGER update_student_fees_on_payment_change_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_student_fees_on_payment_change();

-- Backfill expected_fee and paid_fee for existing students
DO $$
DECLARE
  v_student RECORD;
BEGIN
  FOR v_student IN SELECT id, join_date, fee_amount, fee_type FROM public.students
  LOOP
    -- Calculate expected_fee
    UPDATE public.students
    SET 
      expected_fee = public.calculate_expected_fee(
        v_student.join_date,
        v_student.fee_amount,
        v_student.fee_type,
        CURRENT_DATE
      ),
      paid_fee = (
        SELECT COALESCE(SUM(amount), 0) 
        FROM public.payments 
        WHERE student_id = v_student.id
      )
    WHERE id = v_student.id;
    
    -- Calculate remaining_fee
    UPDATE public.students
    SET remaining_fee = expected_fee - paid_fee
    WHERE id = v_student.id;
  END LOOP;
END $$;

-- Create audit log table for fee recalculations
CREATE TABLE IF NOT EXISTS public.fee_calculation_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  actor_id UUID,
  changed_fields JSONB,
  old_values JSONB,
  new_values JSONB,
  calculation_timestamp TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on audit table
ALTER TABLE public.fee_calculation_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own audit logs"
  ON public.fee_calculation_audit
  FOR SELECT
  USING (actor_id = auth.uid());

-- Create function to log fee changes
CREATE OR REPLACE FUNCTION public.log_fee_calculation_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only log on UPDATE where fee fields changed
  IF TG_OP = 'UPDATE' AND (
    OLD.fee_amount IS DISTINCT FROM NEW.fee_amount OR
    OLD.fee_type IS DISTINCT FROM NEW.fee_type OR
    OLD.join_date IS DISTINCT FROM NEW.join_date OR
    OLD.expected_fee IS DISTINCT FROM NEW.expected_fee OR
    OLD.remaining_fee IS DISTINCT FROM NEW.remaining_fee
  ) THEN
    INSERT INTO public.fee_calculation_audit (
      student_id,
      actor_id,
      changed_fields,
      old_values,
      new_values
    ) VALUES (
      NEW.id,
      auth.uid(),
      jsonb_build_object(
        'fee_amount', (OLD.fee_amount IS DISTINCT FROM NEW.fee_amount),
        'fee_type', (OLD.fee_type IS DISTINCT FROM NEW.fee_type),
        'join_date', (OLD.join_date IS DISTINCT FROM NEW.join_date)
      ),
      jsonb_build_object(
        'fee_amount', OLD.fee_amount,
        'fee_type', OLD.fee_type,
        'join_date', OLD.join_date,
        'expected_fee', OLD.expected_fee,
        'remaining_fee', OLD.remaining_fee
      ),
      jsonb_build_object(
        'fee_amount', NEW.fee_amount,
        'fee_type', NEW.fee_type,
        'join_date', NEW.join_date,
        'expected_fee', NEW.expected_fee,
        'remaining_fee', NEW.remaining_fee
      )
    );
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create trigger for audit logging
DROP TRIGGER IF EXISTS log_fee_calculation_changes ON public.students;
CREATE TRIGGER log_fee_calculation_changes
  AFTER UPDATE ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.log_fee_calculation_change();