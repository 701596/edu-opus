-- Add currency columns to track transaction currencies
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS currency text DEFAULT 'USD';
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS currency text DEFAULT 'USD';
ALTER TABLE public.salaries ADD COLUMN IF NOT EXISTS currency text DEFAULT 'USD';

-- Add role column to staff for better organization
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS role text;

-- Update staff table: rename position to role if needed (position still exists but role is clearer)
UPDATE public.staff SET role = position WHERE role IS NULL;

-- Add indexes for better performance on foreign keys
CREATE INDEX IF NOT EXISTS idx_payments_student_id ON public.payments(student_id);
CREATE INDEX IF NOT EXISTS idx_salaries_staff_id ON public.salaries(staff_id);
CREATE INDEX IF NOT EXISTS idx_fee_folders_student_id ON public.fee_folders(student_id);

-- Create a function to calculate total paid fees for a student
CREATE OR REPLACE FUNCTION public.calculate_student_paid_fees(student_uuid uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(amount), 0)
  FROM public.payments
  WHERE student_id = student_uuid;
$$;

-- Create a function to calculate remaining fees for a student
CREATE OR REPLACE FUNCTION public.calculate_student_remaining_fees(student_uuid uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT fee_amount FROM public.students WHERE id = student_uuid) - 
    (SELECT public.calculate_student_paid_fees(student_uuid)),
    0
  );
$$;