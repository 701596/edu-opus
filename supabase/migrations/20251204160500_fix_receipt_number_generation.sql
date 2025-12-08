-- =============================================
-- FIX: Payment Receipt Number Auto-Generation
-- =============================================
-- This fixes the "receipt_number violates not-null constraint" error
-- by auto-generating receipt numbers when not provided

BEGIN;

-- =============================================
-- STEP 1: Make receipt_number nullable temporarily
-- =============================================
ALTER TABLE public.payments 
  ALTER COLUMN receipt_number DROP NOT NULL;

ALTER TABLE public.expenses 
  ALTER COLUMN receipt_number DROP NOT NULL;

-- =============================================
-- STEP 2: Create function to auto-generate receipt numbers
-- =============================================
CREATE OR REPLACE FUNCTION public.generate_receipt_number()
RETURNS TRIGGER AS $$
DECLARE
  v_prefix TEXT;
  v_date TEXT;
  v_count INT;
  v_receipt_number TEXT;
BEGIN
  -- Only generate if receipt_number is NULL
  IF NEW.receipt_number IS NULL THEN
    -- Determine prefix based on table
    IF TG_TABLE_NAME = 'payments' THEN
      v_prefix := 'PAY';
    ELSIF TG_TABLE_NAME = 'expenses' THEN
      v_prefix := 'EXP';
    ELSE
      v_prefix := 'REC';
    END IF;
    
    -- Get date in YYYYMMDD format
    IF TG_TABLE_NAME = 'payments' THEN
      v_date := TO_CHAR(NEW.payment_date, 'YYYYMMDD');
    ELSIF TG_TABLE_NAME = 'expenses' THEN
      v_date := TO_CHAR(NEW.expense_date, 'YYYYMMDD');
    ELSE
      v_date := TO_CHAR(CURRENT_DATE, 'YYYYMMDD');
    END IF;
    
    -- Count existing receipts for this user and date
    IF TG_TABLE_NAME = 'payments' THEN
      SELECT COUNT(*) INTO v_count
      FROM public.payments
      WHERE user_id = NEW.user_id
        AND payment_date = NEW.payment_date;
    ELSIF TG_TABLE_NAME = 'expenses' THEN
      SELECT COUNT(*) INTO v_count
      FROM public.expenses
      WHERE user_id = NEW.user_id
        AND expense_date = NEW.expense_date;
    ELSE
      v_count := 0;
    END IF;
    
    -- Generate receipt number: PREFIX-YYYYMMDD-XXXX
    v_receipt_number := v_prefix || '-' || v_date || '-' || LPAD((v_count + 1)::TEXT, 4, '0');
    
    NEW.receipt_number := v_receipt_number;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- STEP 3: Create triggers for auto-generation
-- =============================================
DROP TRIGGER IF EXISTS generate_receipt_number_payments ON public.payments;
CREATE TRIGGER generate_receipt_number_payments
  BEFORE INSERT ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_receipt_number();

DROP TRIGGER IF EXISTS generate_receipt_number_expenses ON public.expenses;
CREATE TRIGGER generate_receipt_number_expenses
  BEFORE INSERT ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_receipt_number();

-- =============================================
-- STEP 4: Backfill existing NULL receipt numbers
-- =============================================
-- For payments (using CTE to avoid window function in UPDATE)
WITH numbered_payments AS (
  SELECT 
    id,
    'PAY-' || TO_CHAR(payment_date, 'YYYYMMDD') || '-' || 
    LPAD(ROW_NUMBER() OVER (PARTITION BY user_id, payment_date ORDER BY created_at)::TEXT, 4, '0') as new_receipt_number
  FROM public.payments
  WHERE receipt_number IS NULL
)
UPDATE public.payments p
SET receipt_number = np.new_receipt_number
FROM numbered_payments np
WHERE p.id = np.id;

-- For expenses (using CTE)
WITH numbered_expenses AS (
  SELECT 
    id,
    'EXP-' || TO_CHAR(expense_date, 'YYYYMMDD') || '-' ||
    LPAD(ROW_NUMBER() OVER (PARTITION BY user_id, expense_date ORDER BY created_at)::TEXT, 4, '0') as new_receipt_number
  FROM public.expenses
  WHERE receipt_number IS NULL
)
UPDATE public.expenses e
SET receipt_number = ne.new_receipt_number
FROM numbered_expenses ne
WHERE e.id = ne.id;

-- =============================================
-- STEP 5: Make receipt_number NOT NULL again
-- =============================================
-- After backfill, enforce NOT NULL
ALTER TABLE public.payments 
  ALTER COLUMN receipt_number SET NOT NULL;

ALTER TABLE public.expenses 
  ALTER COLUMN receipt_number SET NOT NULL;

COMMIT;

-- =============================================
-- TEST QUERY (Run after migration)
-- =============================================
-- Should succeed and auto-generate receipt_number:
-- INSERT INTO public.payments (student_id, amount, payment_date, payment_method, user_id)
-- SELECT id, 100, CURRENT_DATE, 'cash', auth.uid() FROM public.students LIMIT 1;
--
-- Then check:
-- SELECT receipt_number FROM public.payments ORDER BY created_at DESC LIMIT 1;
-- Expected format: PAY-20251204-0001
