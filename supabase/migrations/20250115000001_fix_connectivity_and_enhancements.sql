-- Fix Connectivity and Enhancements Migration
-- This migration fixes all connectivity issues and adds required enhancements

-- Add joining_date to students table
ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS joining_date DATE DEFAULT CURRENT_DATE;

-- Add joining_date to staff table  
ALTER TABLE public.staff
ADD COLUMN IF NOT EXISTS joining_date DATE DEFAULT CURRENT_DATE;

-- Add calculated_total_fee to students (calculated from joining date)
ALTER TABLE public.students
ADD COLUMN IF NOT EXISTS calculated_total_fee NUMERIC(10,2) DEFAULT 0;

-- Add calculated_total_salary to staff (calculated from joining date)
ALTER TABLE public.staff
ADD COLUMN IF NOT EXISTS calculated_total_salary NUMERIC(10,2) DEFAULT 0;

-- Update existing records to have joining_date as enrollment_date/hire_date
UPDATE public.students 
SET joining_date = enrollment_date 
WHERE joining_date IS NULL;

UPDATE public.staff 
SET joining_date = hire_date 
WHERE joining_date IS NULL;

-- Create function to calculate total fee from joining date
CREATE OR REPLACE FUNCTION public.calculate_total_fee_from_joining_date(
  student_uuid uuid,
  fee_amount numeric,
  fee_type text,
  joining_date date
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  months_elapsed integer;
  total_fee numeric;
BEGIN
  -- Calculate months elapsed from joining date to current date
  months_elapsed := EXTRACT(YEAR FROM AGE(CURRENT_DATE, joining_date)) * 12 + 
                    EXTRACT(MONTH FROM AGE(CURRENT_DATE, joining_date));
  
  -- Calculate total fee based on fee type
  IF fee_type = 'monthly' THEN
    total_fee := fee_amount * GREATEST(months_elapsed, 1);
  ELSE -- annually
    total_fee := fee_amount * CEIL(months_elapsed / 12.0);
  END IF;
  
  RETURN total_fee;
END;
$$;

-- Create function to calculate total salary from joining date
CREATE OR REPLACE FUNCTION public.calculate_total_salary_from_joining_date(
  staff_uuid uuid,
  salary_amount numeric,
  salary_type text,
  joining_date date
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  months_elapsed integer;
  total_salary numeric;
BEGIN
  -- Calculate months elapsed from joining date to current date
  months_elapsed := EXTRACT(YEAR FROM AGE(CURRENT_DATE, joining_date)) * 12 + 
                    EXTRACT(MONTH FROM AGE(CURRENT_DATE, joining_date));
  
  -- Calculate total salary based on salary type
  IF salary_type = 'monthly' THEN
    total_salary := salary_amount * GREATEST(months_elapsed, 1);
  ELSE -- annually
    total_salary := salary_amount * CEIL(months_elapsed / 12.0);
  END IF;
  
  RETURN total_salary;
END;
$$;

-- Create trigger to automatically calculate total fee when student is added/updated
CREATE OR REPLACE FUNCTION public.update_student_calculated_fee()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Calculate and update the calculated_total_fee
  NEW.calculated_total_fee := public.calculate_total_fee_from_joining_date(
    NEW.id,
    NEW.fee_amount,
    NEW.fee_type,
    NEW.joining_date
  );
  
  RETURN NEW;
END;
$$;

-- Create trigger to automatically calculate total salary when staff is added/updated
CREATE OR REPLACE FUNCTION public.update_staff_calculated_salary()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Calculate and update the calculated_total_salary
  NEW.calculated_total_salary := public.calculate_total_salary_from_joining_date(
    NEW.id,
    NEW.salary,
    NEW.salary_type,
    NEW.joining_date
  );
  
  RETURN NEW;
END;
$$;

-- Create triggers
DROP TRIGGER IF EXISTS trigger_update_student_calculated_fee ON public.students;
CREATE TRIGGER trigger_update_student_calculated_fee
  BEFORE INSERT OR UPDATE ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.update_student_calculated_fee();

DROP TRIGGER IF EXISTS trigger_update_staff_calculated_salary ON public.staff;
CREATE TRIGGER trigger_update_staff_calculated_salary
  BEFORE INSERT OR UPDATE ON public.staff
  FOR EACH ROW
  EXECUTE FUNCTION public.update_staff_calculated_salary();

-- Update existing students and staff with calculated values
UPDATE public.students 
SET calculated_total_fee = public.calculate_total_fee_from_joining_date(
  id, fee_amount, fee_type, joining_date
);

UPDATE public.staff 
SET calculated_total_salary = public.calculate_total_salary_from_joining_date(
  id, salary, salary_type, joining_date
);

-- Create function to get financial overview with correct calculations
CREATE OR REPLACE FUNCTION public.get_corrected_financial_overview()
RETURNS TABLE (
  total_students bigint,
  total_staff bigint,
  total_income numeric,
  total_expenses numeric,
  remaining_fees numeric,
  net_profit numeric,
  profit_margin numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    (SELECT COUNT(*) FROM public.students) as total_students,
    (SELECT COUNT(*) FROM public.staff) as total_staff,
    (SELECT COALESCE(SUM(amount), 0) FROM public.payments) as total_income,
    (SELECT COALESCE(SUM(amount), 0) FROM public.expenses) as total_expenses,
    (SELECT COALESCE(SUM(amount_due - COALESCE(amount_paid, 0)), 0) FROM public.fee_folders) as remaining_fees,
    (SELECT COALESCE(SUM(amount), 0) FROM public.payments) - 
    (SELECT COALESCE(SUM(amount), 0) FROM public.expenses) as net_profit,
    CASE 
      WHEN (SELECT COALESCE(SUM(amount), 0) FROM public.expenses) > 0 
      THEN ((SELECT COALESCE(SUM(amount), 0) FROM public.payments) / 
            (SELECT COALESCE(SUM(amount), 0) FROM public.expenses)) * 100
      ELSE 0
    END as profit_margin;
$$;

-- Create function to automatically update fee folder when student is added
CREATE OR REPLACE FUNCTION public.create_student_fee_folder_enhanced()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only create fee folder if student has fee_amount > 0
  IF NEW.fee_amount > 0 THEN
    INSERT INTO public.fee_folders (
      student_id,
      folder_name,
      category,
      amount_due,
      amount_paid,
      due_date,
      status
    ) VALUES (
      NEW.id,
      CASE 
        WHEN NEW.fee_type = 'monthly' THEN 'Monthly Tuition Fee'
        ELSE 'Annual Tuition Fee'
      END,
      'tuition',
      NEW.calculated_total_fee,
      0,
      CASE 
        WHEN NEW.fee_type = 'monthly' THEN CURRENT_DATE + INTERVAL '1 month'
        ELSE CURRENT_DATE + INTERVAL '1 year'
      END,
      'pending'
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Update the trigger to use the enhanced function
DROP TRIGGER IF EXISTS trigger_create_student_fee_folder ON public.students;
CREATE TRIGGER trigger_create_student_fee_folder
  AFTER INSERT ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.create_student_fee_folder_enhanced();

-- Create function to automatically add staff salary to expenses
CREATE OR REPLACE FUNCTION public.add_staff_salary_to_expenses_enhanced()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  staff_name TEXT;
BEGIN
  -- Get staff name
  SELECT name INTO staff_name FROM public.staff WHERE id = NEW.id;
  
  -- Add calculated total salary as expense
  INSERT INTO public.expenses (
    category,
    description,
    vendor,
    amount,
    expense_date,
    receipt_number,
    currency
  ) VALUES (
    'Staff Salary',
    'Total salary for ' || COALESCE(staff_name, 'Staff') || ' from joining date',
    COALESCE(staff_name, 'Staff'),
    NEW.calculated_total_salary,
    CURRENT_DATE,
    'SAL-' || EXTRACT(EPOCH FROM NOW())::bigint,
    'USD'
  );
  
  RETURN NEW;
END;
$$;

-- Create trigger to automatically add staff salary to expenses
DROP TRIGGER IF EXISTS trigger_add_staff_salary_to_expenses ON public.staff;
CREATE TRIGGER trigger_add_staff_salary_to_expenses
  AFTER INSERT ON public.staff
  FOR EACH ROW
  EXECUTE FUNCTION public.add_staff_salary_to_expenses_enhanced();

-- Create function to update fee folder when payment is made
CREATE OR REPLACE FUNCTION public.update_fee_folder_on_payment_enhanced()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fee_folder RECORD;
  new_amount_paid numeric;
  new_status text;
BEGIN
  -- Find the first pending fee folder for this student
  SELECT * INTO fee_folder 
  FROM public.fee_folders 
  WHERE student_id = NEW.student_id 
    AND status != 'paid'
  ORDER BY due_date ASC 
  LIMIT 1;
  
  -- If found, update it
  IF fee_folder.id IS NOT NULL THEN
    new_amount_paid := COALESCE(fee_folder.amount_paid, 0) + NEW.amount;
    
    -- Determine new status
    IF new_amount_paid >= fee_folder.amount_due THEN
      new_status := 'paid';
    ELSIF new_amount_paid > 0 THEN
      new_status := 'partial';
    ELSE
      new_status := 'pending';
    END IF;
    
    UPDATE public.fee_folders 
    SET 
      amount_paid = new_amount_paid,
      status = new_status,
      updated_at = NOW()
    WHERE id = fee_folder.id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Update the payment trigger
DROP TRIGGER IF EXISTS trigger_update_fee_folder_on_payment ON public.payments;
CREATE TRIGGER trigger_update_fee_folder_on_payment
  AFTER INSERT ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_fee_folder_on_payment_enhanced();

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_students_joining_date ON public.students(joining_date);
CREATE INDEX IF NOT EXISTS idx_staff_joining_date ON public.staff(joining_date);
CREATE INDEX IF NOT EXISTS idx_fee_folders_student_status ON public.fee_folders(student_id, status);

-- Add comments for documentation
COMMENT ON FUNCTION public.calculate_total_fee_from_joining_date IS 'Calculate total fee from joining date based on fee type';
COMMENT ON FUNCTION public.calculate_total_salary_from_joining_date IS 'Calculate total salary from joining date based on salary type';
COMMENT ON FUNCTION public.get_corrected_financial_overview IS 'Get corrected financial overview with proper calculations';
COMMENT ON FUNCTION public.create_student_fee_folder_enhanced IS 'Create fee folder with calculated total fee';
COMMENT ON FUNCTION public.add_staff_salary_to_expenses_enhanced IS 'Add staff salary to expenses with calculated total';
COMMENT ON FUNCTION public.update_fee_folder_on_payment_enhanced IS 'Update fee folder with proper status calculation';
