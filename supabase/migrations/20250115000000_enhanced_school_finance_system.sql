-- Enhanced School Finance Management System Migration
-- This migration adds missing features and improves data connectivity

-- Add missing columns to students table
ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS class TEXT,
ADD COLUMN IF NOT EXISTS guardian_name TEXT,
ADD COLUMN IF NOT EXISTS guardian_phone TEXT,
ADD COLUMN IF NOT EXISTS date_of_birth DATE,
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT;

-- Add missing columns to staff table  
ALTER TABLE public.staff
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS department TEXT,
ADD COLUMN IF NOT EXISTS hire_date DATE DEFAULT CURRENT_DATE;

-- Add missing columns to expenses table
ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS vendor TEXT,
ADD COLUMN IF NOT EXISTS receipt_number TEXT,
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD';

-- Add missing columns to payments table
ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS receipt_number TEXT,
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD';

-- Add missing columns to fee_folders table
ALTER TABLE public.fee_folders
ADD COLUMN IF NOT EXISTS due_date DATE,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';

-- Create settings table for system configuration
CREATE TABLE IF NOT EXISTS public.settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Insert default currency setting
INSERT INTO public.settings (key, value) 
VALUES ('currency', '{"code": "USD", "symbol": "$", "name": "US Dollar"}')
ON CONFLICT (key) DO NOTHING;

-- Create financial summary view for better performance
CREATE OR REPLACE VIEW public.financial_summary AS
SELECT 
  (SELECT COUNT(*) FROM public.students) as total_students,
  (SELECT COUNT(*) FROM public.staff) as total_staff,
  (SELECT COALESCE(SUM(amount), 0) FROM public.payments) as total_income,
  (SELECT COALESCE(SUM(amount), 0) FROM public.expenses) as total_expenses,
  (SELECT COALESCE(SUM(net_amount), 0) FROM public.salaries) as total_salaries,
  (SELECT COALESCE(SUM(amount_due), 0) FROM public.fee_folders) as total_fees_due,
  (SELECT COALESCE(SUM(amount_due - COALESCE(amount_paid, 0)), 0) FROM public.fee_folders) as remaining_fees;

-- Create function to get financial overview
CREATE OR REPLACE FUNCTION public.get_financial_overview()
RETURNS TABLE (
  total_students bigint,
  total_staff bigint,
  total_income numeric,
  total_expenses numeric,
  total_salaries numeric,
  net_profit numeric,
  remaining_fees numeric
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
    (SELECT COALESCE(SUM(net_amount), 0) FROM public.salaries) as total_salaries,
    (SELECT COALESCE(SUM(amount), 0) FROM public.payments) - 
    (SELECT COALESCE(SUM(amount), 0) FROM public.expenses) as net_profit,
    (SELECT COALESCE(SUM(amount_due - COALESCE(amount_paid, 0)), 0) FROM public.fee_folders) as remaining_fees;
$$;

-- Create function to update fee folder status
CREATE OR REPLACE FUNCTION public.update_fee_folder_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update status based on amount_paid vs amount_due
  IF NEW.amount_paid >= NEW.amount_due THEN
    NEW.status := 'paid';
  ELSIF NEW.amount_paid > 0 THEN
    NEW.status := 'partial';
  ELSE
    NEW.status := 'pending';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to automatically update fee folder status
DROP TRIGGER IF EXISTS trigger_update_fee_folder_status ON public.fee_folders;
CREATE TRIGGER trigger_update_fee_folder_status
  BEFORE UPDATE ON public.fee_folders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_fee_folder_status();

-- Create function to automatically create fee folder when student is added
CREATE OR REPLACE FUNCTION public.create_student_fee_folder()
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
      NEW.fee_amount,
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

-- Create trigger to automatically create fee folder for new students
DROP TRIGGER IF EXISTS trigger_create_student_fee_folder ON public.students;
CREATE TRIGGER trigger_create_student_fee_folder
  AFTER INSERT ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.create_student_fee_folder();

-- Create function to automatically add salary to expenses
CREATE OR REPLACE FUNCTION public.add_salary_to_expenses()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  staff_name TEXT;
BEGIN
  -- Get staff name
  SELECT name INTO staff_name FROM public.staff WHERE id = NEW.staff_id;
  
  -- Add salary as expense
  INSERT INTO public.expenses (
    category,
    description,
    vendor,
    amount,
    expense_date,
    receipt_number,
    currency
  ) VALUES (
    'Salary',
    'Salary payment for ' || COALESCE(staff_name, 'Staff'),
    COALESCE(staff_name, 'Staff'),
    NEW.net_amount,
    NEW.payment_date,
    'SAL-' || EXTRACT(EPOCH FROM NOW())::bigint,
    COALESCE(NEW.currency, 'USD')
  );
  
  RETURN NEW;
END;
$$;

-- Create trigger to automatically add salary to expenses
DROP TRIGGER IF EXISTS trigger_add_salary_to_expenses ON public.salaries;
CREATE TRIGGER trigger_add_salary_to_expenses
  AFTER INSERT ON public.salaries
  FOR EACH ROW
  EXECUTE FUNCTION public.add_salary_to_expenses();

-- Create function to update fee folder when payment is made
CREATE OR REPLACE FUNCTION public.update_fee_folder_on_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fee_folder RECORD;
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
    UPDATE public.fee_folders 
    SET 
      amount_paid = COALESCE(amount_paid, 0) + NEW.amount,
      updated_at = NOW()
    WHERE id = fee_folder.id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to update fee folder when payment is made
DROP TRIGGER IF EXISTS trigger_update_fee_folder_on_payment ON public.payments;
CREATE TRIGGER trigger_update_fee_folder_on_payment
  AFTER INSERT ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_fee_folder_on_payment();

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_students_class ON public.students(class);
CREATE INDEX IF NOT EXISTS idx_fee_folders_status ON public.fee_folders(status);
CREATE INDEX IF NOT EXISTS idx_payments_date ON public.payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_salaries_date ON public.salaries(payment_date);

-- Enable RLS on settings table
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for settings
CREATE POLICY "Authenticated users can view settings" 
ON public.settings FOR SELECT 
TO authenticated USING (true);

CREATE POLICY "Authenticated users can update settings" 
ON public.settings FOR UPDATE 
TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert settings" 
ON public.settings FOR INSERT 
TO authenticated WITH CHECK (true);

-- Create trigger for settings updated_at
CREATE TRIGGER update_settings_updated_at
BEFORE UPDATE ON public.settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE public.students IS 'Student information and enrollment data';
COMMENT ON TABLE public.staff IS 'Staff and employee information';
COMMENT ON TABLE public.payments IS 'Student fee payments';
COMMENT ON TABLE public.expenses IS 'School operational expenses';
COMMENT ON TABLE public.salaries IS 'Staff salary payments';
COMMENT ON TABLE public.fee_folders IS 'Student fee tracking and remaining amounts';
COMMENT ON TABLE public.settings IS 'System configuration and settings';
COMMENT ON VIEW public.financial_summary IS 'Real-time financial overview';
COMMENT ON FUNCTION public.get_financial_overview() IS 'Get comprehensive financial data';
COMMENT ON FUNCTION public.update_fee_folder_status() IS 'Automatically update fee folder status';
COMMENT ON FUNCTION public.create_student_fee_folder() IS 'Auto-create fee folder for new students';
COMMENT ON FUNCTION public.add_salary_to_expenses() IS 'Auto-add salary payments to expenses';
COMMENT ON FUNCTION public.update_fee_folder_on_payment() IS 'Auto-update fee folders when payments are made';
