-- Create function to recalculate student fees on update
CREATE OR REPLACE FUNCTION public.recalculate_student_fees_on_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total_paid NUMERIC;
BEGIN
  -- Only recalculate if fee_amount or fee_type changed
  IF (TG_OP = 'UPDATE' AND (OLD.fee_amount IS DISTINCT FROM NEW.fee_amount OR OLD.fee_type IS DISTINCT FROM NEW.fee_type)) THEN
    -- Recalculate total_fee based on fee_type
    IF NEW.fee_type = 'monthly' THEN
      NEW.total_fee := NEW.fee_amount * 12;
    ELSE
      NEW.total_fee := NEW.fee_amount;
    END IF;
    
    -- Get total paid for this student
    SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
    FROM public.payments
    WHERE student_id = NEW.id;
    
    -- Recalculate remaining_fee
    NEW.remaining_fee := NEW.total_fee - v_total_paid;
    
    -- Update payment status
    NEW.payment_status := CASE 
      WHEN NEW.remaining_fee <= 0 THEN 'paid'
      WHEN v_total_paid > 0 THEN 'partial'
      ELSE 'pending'
    END;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create trigger on students table for updates
DROP TRIGGER IF EXISTS recalculate_fees_on_student_update ON public.students;
CREATE TRIGGER recalculate_fees_on_student_update
  BEFORE UPDATE ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.recalculate_student_fees_on_update();

-- Also ensure reports are updated when students change
DROP TRIGGER IF EXISTS update_reports_on_student_change ON public.students;
CREATE TRIGGER update_reports_on_student_change
  AFTER INSERT OR UPDATE OR DELETE ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.update_monthly_report();