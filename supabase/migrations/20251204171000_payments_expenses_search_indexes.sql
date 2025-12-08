-- =============================================
-- MIGRATION: Payments & Expenses Search + Indexes
-- Version: 0.2.0 - Financial Pagination Update
-- SAFE VERSION - Disables triggers during backfill
-- =============================================

BEGIN;

-- =============================================
-- TEMPORARILY DISABLE TRIGGERS
-- =============================================
ALTER TABLE public.payments DISABLE TRIGGER USER;
ALTER TABLE public.expenses DISABLE TRIGGER USER;

-- =============================================
-- PAYMENTS TABLE: Full-Text Search Setup
-- =============================================

-- Add search_vector column
ALTER TABLE public.payments 
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Create search vector update function for payments
CREATE OR REPLACE FUNCTION public.payments_search_vector_trigger()
RETURNS trigger AS $$
DECLARE
  student_name TEXT;
BEGIN
  -- Get student name for search
  SELECT name INTO student_name
  FROM public.students
  WHERE id = NEW.student_id;

  NEW.search_vector := to_tsvector('english',
    COALESCE(student_name, '') || ' ' ||
    COALESCE(NEW.receipt_number, '') || ' ' ||
    COALESCE(NEW.payment_method, '') || ' ' ||
    COALESCE(NEW.category, '') || ' ' ||
    COALESCE(NEW.description, '') || ' ' ||
    COALESCE(NEW.amount::text, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for payments (will be active after we re-enable)
DROP TRIGGER IF EXISTS payments_search_vector_update ON public.payments;
CREATE TRIGGER payments_search_vector_update
  BEFORE INSERT OR UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.payments_search_vector_trigger();

-- Create indexes for payments
CREATE INDEX IF NOT EXISTS idx_payments_search_vector 
  ON public.payments USING GIN (search_vector);

CREATE INDEX IF NOT EXISTS idx_payments_created_at 
  ON public.payments (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_user_id 
  ON public.payments (user_id);

CREATE INDEX IF NOT EXISTS idx_payments_payment_date
  ON public.payments (payment_date DESC);

-- =============================================
-- EXPENSES TABLE: Full-Text Search Setup
-- =============================================

-- Add search_vector column
ALTER TABLE public.expenses 
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Create search vector update function for expenses
CREATE OR REPLACE FUNCTION public.expenses_search_vector_trigger()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    COALESCE(NEW.description, '') || ' ' ||
    COALESCE(NEW.category, '') || ' ' ||
    COALESCE(NEW.receipt_number, '') || ' ' ||
    COALESCE(NEW.amount::text, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for expenses
DROP TRIGGER IF EXISTS expenses_search_vector_update ON public.expenses;
CREATE TRIGGER expenses_search_vector_update
  BEFORE INSERT OR UPDATE ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.expenses_search_vector_trigger();

-- Create indexes for expenses
CREATE INDEX IF NOT EXISTS idx_expenses_search_vector 
  ON public.expenses USING GIN (search_vector);

CREATE INDEX IF NOT EXISTS idx_expenses_created_at 
  ON public.expenses (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_expenses_user_id 
  ON public.expenses (user_id);

CREATE INDEX IF NOT EXISTS idx_expenses_expense_date
  ON public.expenses (expense_date DESC);

-- =============================================
-- BACKFILL: Populate search_vector (triggers disabled)
-- =============================================

-- Backfill payments search_vector directly (no trigger fire)
UPDATE public.payments p
SET search_vector = to_tsvector('english',
  COALESCE((SELECT name FROM public.students WHERE id = p.student_id), '') || ' ' ||
  COALESCE(p.receipt_number, '') || ' ' ||
  COALESCE(p.payment_method, '') || ' ' ||
  COALESCE(p.category, '') || ' ' ||
  COALESCE(p.description, '') || ' ' ||
  COALESCE(p.amount::text, '')
)
WHERE search_vector IS NULL;

-- Backfill expenses search_vector directly (no trigger fire)
UPDATE public.expenses
SET search_vector = to_tsvector('english',
  COALESCE(description, '') || ' ' ||
  COALESCE(category, '') || ' ' ||
  COALESCE(receipt_number, '') || ' ' ||
  COALESCE(amount::text, '')
)
WHERE search_vector IS NULL;

-- =============================================
-- RE-ENABLE TRIGGERS
-- =============================================
ALTER TABLE public.payments ENABLE TRIGGER USER;
ALTER TABLE public.expenses ENABLE TRIGGER USER;

COMMIT;

-- =============================================
-- VERIFICATION (Run after migration)
-- =============================================
-- SELECT indexname FROM pg_indexes WHERE tablename IN ('payments', 'expenses');
-- Expected: idx_payments_search_vector, idx_expenses_search_vector, etc.
