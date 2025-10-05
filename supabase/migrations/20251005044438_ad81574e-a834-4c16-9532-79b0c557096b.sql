-- Add join_date column to students table
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS join_date date DEFAULT CURRENT_DATE;

-- Add join_date column to staff table  
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS join_date date DEFAULT CURRENT_DATE;

-- Update existing records to use enrollment_date/hire_date as join_date
UPDATE public.students SET join_date = enrollment_date WHERE join_date IS NULL;
UPDATE public.staff SET join_date = hire_date WHERE join_date IS NULL;