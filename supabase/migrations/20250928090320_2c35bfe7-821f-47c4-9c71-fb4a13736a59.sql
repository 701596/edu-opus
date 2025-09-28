-- Create students table
CREATE TABLE public.students (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  date_of_birth DATE,
  enrollment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  grade_level TEXT,
  guardian_name TEXT,
  guardian_phone TEXT,
  fees_amount DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create staff table
CREATE TABLE public.staff (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  position TEXT NOT NULL,
  department TEXT,
  hire_date DATE NOT NULL DEFAULT CURRENT_DATE,
  salary DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create payments table
CREATE TABLE public.payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT NOT NULL,
  description TEXT,
  receipt_number TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create expenses table
CREATE TABLE public.expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  vendor TEXT,
  receipt_number TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create salaries table
CREATE TABLE public.salaries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  pay_period_start DATE NOT NULL,
  pay_period_end DATE NOT NULL,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  bonus DECIMAL(10,2) DEFAULT 0,
  deductions DECIMAL(10,2) DEFAULT 0,
  net_amount DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create fee_folders table for remaining fees and custom categories
CREATE TABLE public.fee_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  folder_name TEXT NOT NULL,
  category TEXT NOT NULL,
  amount_due DECIMAL(10,2) NOT NULL,
  amount_paid DECIMAL(10,2) DEFAULT 0,
  due_date DATE,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_folders ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for students
CREATE POLICY "Authenticated users can view all students" 
ON public.students FOR SELECT 
TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert students" 
ON public.students FOR INSERT 
TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update students" 
ON public.students FOR UPDATE 
TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete students" 
ON public.students FOR DELETE 
TO authenticated USING (true);

-- Create RLS policies for staff
CREATE POLICY "Authenticated users can view all staff" 
ON public.staff FOR SELECT 
TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert staff" 
ON public.staff FOR INSERT 
TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update staff" 
ON public.staff FOR UPDATE 
TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete staff" 
ON public.staff FOR DELETE 
TO authenticated USING (true);

-- Create RLS policies for payments
CREATE POLICY "Authenticated users can view all payments" 
ON public.payments FOR SELECT 
TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert payments" 
ON public.payments FOR INSERT 
TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update payments" 
ON public.payments FOR UPDATE 
TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete payments" 
ON public.payments FOR DELETE 
TO authenticated USING (true);

-- Create RLS policies for expenses
CREATE POLICY "Authenticated users can view all expenses" 
ON public.expenses FOR SELECT 
TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert expenses" 
ON public.expenses FOR INSERT 
TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update expenses" 
ON public.expenses FOR UPDATE 
TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete expenses" 
ON public.expenses FOR DELETE 
TO authenticated USING (true);

-- Create RLS policies for salaries
CREATE POLICY "Authenticated users can view all salaries" 
ON public.salaries FOR SELECT 
TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert salaries" 
ON public.salaries FOR INSERT 
TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update salaries" 
ON public.salaries FOR UPDATE 
TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete salaries" 
ON public.salaries FOR DELETE 
TO authenticated USING (true);

-- Create RLS policies for fee_folders
CREATE POLICY "Authenticated users can view all fee_folders" 
ON public.fee_folders FOR SELECT 
TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert fee_folders" 
ON public.fee_folders FOR INSERT 
TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update fee_folders" 
ON public.fee_folders FOR UPDATE 
TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete fee_folders" 
ON public.fee_folders FOR DELETE 
TO authenticated USING (true);

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_students_updated_at
BEFORE UPDATE ON public.students
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_staff_updated_at
BEFORE UPDATE ON public.staff
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_payments_updated_at
BEFORE UPDATE ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_expenses_updated_at
BEFORE UPDATE ON public.expenses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_salaries_updated_at
BEFORE UPDATE ON public.salaries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_fee_folders_updated_at
BEFORE UPDATE ON public.fee_folders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();