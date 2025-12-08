-- ========================================
-- DIAGNOSTIC QUERIES FOR PAYMENT ERROR
-- ========================================
-- Run these queries ONE AT A TIME to identify the issue

-- ========================================
-- QUERY 1: Check trigger exists on payments
-- ========================================
SELECT 
  tgname as trigger_name,
  CASE tgenabled 
    WHEN 'O' THEN 'ENABLED'
    WHEN 'D' THEN 'DISABLED'
    ELSE 'UNKNOWN'
  END as status,
  pg_get_triggerdef(oid) as definition
FROM pg_trigger
WHERE tgrelid = 'public.payments'::regclass
ORDER BY tgname;

-- ========================================
-- QUERY 2: Test if you can SELECT from payments
-- ========================================
SELECT COUNT(*) as payment_count
FROM public.payments;

-- If this fails, RLS is blocking the query
-- If it succeeds, the issue is in INSERT

-- ========================================
-- QUERY 3: Check your current user_id
-- ========================================
SELECT auth.uid() as current_user_id;

-- Make note of this UUID for next queries

-- ========================================
-- QUERY 4: Test manual report calculation
-- ========================================
-- Replace 'YOUR-USER-ID' with the UUID from Query 3
SELECT public.recalc_monthly_report(
  2024,
  12,
  auth.uid()
);

-- If this fails, the function itself has an issue
-- If it succeeds, the trigger invocation is the problem

-- ========================================
-- QUERY 5: Check RLS policy on reports
-- ========================================
SELECT 
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'reports';

-- ========================================
-- QUERY 6: Try inserting a payment (CRITICAL TEST)
-- ========================================
-- This will show us the EXACT error message
INSERT INTO public.payments (
  student_id,
  amount,
  payment_date,
  payment_method,
  user_id
) 
SELECT 
  id,
  100,
  CURRENT_DATE,
  'cash',
  auth.uid()
FROM public.students
LIMIT 1;

-- If this succeeds: Issue is in frontend
-- If this fails: Copy the EXACT error message

-- ========================================
-- QUERY 7: Check if payments have user_id
-- ========================================
SELECT 
  COUNT(*) as total,
  COUNT(user_id) as with_user_id,
  COUNT(*) - COUNT(user_id) as missing_user_id
FROM public.payments;

-- ========================================
-- INSTRUCTIONS
-- ========================================
-- 1. Run Query 6 (the INSERT test)
-- 2. Copy the EXACT error message
-- 3. Paste it back to me
-- 4. I'll create the specific fix based on the error
