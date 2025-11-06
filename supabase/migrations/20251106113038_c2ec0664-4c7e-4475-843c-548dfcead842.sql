-- Fix unique constraints to be user-scoped instead of global

-- Students table: Change email constraint to be per-user
ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_email_key;
CREATE UNIQUE INDEX IF NOT EXISTS students_user_email_unique ON public.students(user_id, email) WHERE email IS NOT NULL;

-- Also make student_id unique per user
ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_student_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS students_user_student_id_unique ON public.students(user_id, student_id);

-- Staff table: Make email and staff_id unique per user
ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS staff_email_key;
CREATE UNIQUE INDEX IF NOT EXISTS staff_user_email_unique ON public.staff(user_id, email) WHERE email IS NOT NULL;

ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS staff_staff_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS staff_user_staff_id_unique ON public.staff(user_id, staff_id);

-- Payments table: Make receipt_number unique per user
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_receipt_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS payments_user_receipt_unique ON public.payments(user_id, receipt_number);

-- Expenses table: Make receipt_number unique per user
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_receipt_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS expenses_user_receipt_unique ON public.expenses(user_id, receipt_number);