-- Add user_id to all tables for user-specific data isolation
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.fee_folders ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.salaries ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.payment_audit ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create function to automatically set user_id on insert
CREATE OR REPLACE FUNCTION public.set_user_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.user_id := auth.uid();
  RETURN NEW;
END;
$$;

-- Create triggers to auto-set user_id on all tables
DROP TRIGGER IF EXISTS set_user_id_students ON public.students;
CREATE TRIGGER set_user_id_students
  BEFORE INSERT ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.set_user_id();

DROP TRIGGER IF EXISTS set_user_id_staff ON public.staff;
CREATE TRIGGER set_user_id_staff
  BEFORE INSERT ON public.staff
  FOR EACH ROW
  EXECUTE FUNCTION public.set_user_id();

DROP TRIGGER IF EXISTS set_user_id_payments ON public.payments;
CREATE TRIGGER set_user_id_payments
  BEFORE INSERT ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_user_id();

DROP TRIGGER IF EXISTS set_user_id_expenses ON public.expenses;
CREATE TRIGGER set_user_id_expenses
  BEFORE INSERT ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.set_user_id();

DROP TRIGGER IF EXISTS set_user_id_fee_folders ON public.fee_folders;
CREATE TRIGGER set_user_id_fee_folders
  BEFORE INSERT ON public.fee_folders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_user_id();

DROP TRIGGER IF EXISTS set_user_id_reports ON public.reports;
CREATE TRIGGER set_user_id_reports
  BEFORE INSERT ON public.reports
  FOR EACH ROW
  EXECUTE FUNCTION public.set_user_id();

DROP TRIGGER IF EXISTS set_user_id_salaries ON public.salaries;
CREATE TRIGGER set_user_id_salaries
  BEFORE INSERT ON public.salaries
  FOR EACH ROW
  EXECUTE FUNCTION public.set_user_id();

DROP TRIGGER IF EXISTS set_user_id_payment_audit ON public.payment_audit;
CREATE TRIGGER set_user_id_payment_audit
  BEFORE INSERT ON public.payment_audit
  FOR EACH ROW
  EXECUTE FUNCTION public.set_user_id();

-- Update RLS policies for user isolation
-- Students table
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON public.students;
CREATE POLICY "Users can only access their own students"
  ON public.students
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Staff table
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON public.staff;
CREATE POLICY "Users can only access their own staff"
  ON public.staff
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Payments table
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON public.payments;
CREATE POLICY "Users can only access their own payments"
  ON public.payments
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Expenses table
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON public.expenses;
CREATE POLICY "Users can only access their own expenses"
  ON public.expenses
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Fee folders table
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON public.fee_folders;
CREATE POLICY "Users can only access their own fee folders"
  ON public.fee_folders
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Reports table
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON public.reports;
CREATE POLICY "Users can only access their own reports"
  ON public.reports
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Salaries table
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON public.salaries;
CREATE POLICY "Users can only access their own salaries"
  ON public.salaries
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Payment audit table
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON public.payment_audit;
CREATE POLICY "Users can only access their own payment audits"
  ON public.payment_audit
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Add receipt_url column to payments table
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS receipt_url TEXT;