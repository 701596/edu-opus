-- Add fee columns to students table
ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS fee_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS fee_type text DEFAULT 'monthly' CHECK (fee_type IN ('monthly', 'annually'));

-- Add salary type column to staff table
ALTER TABLE public.staff 
ADD COLUMN IF NOT EXISTS salary_type text DEFAULT 'monthly' CHECK (salary_type IN ('monthly', 'annually'));

-- Add comment for clarity
COMMENT ON COLUMN public.students.fee_amount IS 'Student fee amount';
COMMENT ON COLUMN public.students.fee_type IS 'Fee payment frequency: monthly or annually';
COMMENT ON COLUMN public.staff.salary_type IS 'Salary payment frequency: monthly or annually';