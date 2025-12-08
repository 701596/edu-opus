-- ========================================
-- POST-MIGRATION VERIFICATION SCRIPT
-- Reports Table user_id Fix
-- ========================================

-- 1. Verify NO NULL user_id values remain
SELECT 
  CASE 
    WHEN COUNT(*) = 0 THEN '✅ PASS: No NULL user_id values'
    ELSE '❌ FAIL: ' || COUNT(*) || ' reports still have NULL user_id'
  END AS test_result
FROM public.reports
WHERE user_id IS NULL;

-- 2. Verify user_id column is NOT NULL
SELECT 
  CASE 
    WHEN is_nullable = 'NO' THEN '✅ PASS: user_id is NOT NULL'
    ELSE '❌ FAIL: user_id is still nullable'
  END AS test_result
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'reports' 
  AND column_name = 'user_id';

-- 3. Verify indexes exist
SELECT 
  CASE 
    WHEN COUNT(*) >= 2 THEN '✅ PASS: Indexes created (' || COUNT(*) || ' found)'
    ELSE '❌ FAIL: Missing indexes (' || COUNT(*) || ' found, expected 2)'
  END AS test_result
FROM pg_indexes
WHERE tablename = 'reports' 
  AND schemaname = 'public'
  AND indexname IN ('idx_reports_user_id', 'idx_reports_user_id_month');

-- 4. List all reports indexes
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'reports' AND schemaname = 'public'
ORDER BY indexname;

-- 5. Verify RLS policy exists
SELECT 
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ PASS: RLS policy exists'
    ELSE '❌ FAIL: RLS policy missing'
  END AS test_result
FROM pg_policies
WHERE tablename = 'reports' 
  AND policyname = 'Users can only access their own reports';

-- 6. Check RLS is enabled
SELECT 
  CASE 
    WHEN relrowsecurity THEN '✅ PASS: RLS is enabled'
    ELSE '❌ FAIL: RLS is disabled'
  END AS test_result
FROM pg_class
WHERE relname = 'reports' AND relnamespace = 'public'::regnamespace;

-- 7. Count total reports (should have user_id)
SELECT 
  COUNT(*) as total_reports,
  COUNT(DISTINCT user_id) as distinct_users,
  MIN(month_start) as earliest_report,
  MAX(month_start) as latest_report
FROM public.reports;

-- 8. Test function signature updated
SELECT 
  CASE 
    WHEN array_length(proargtypes, 1) = 3 THEN '✅ PASS: recalc_monthly_report accepts 3 parameters (year, month, user_id)'
    ELSE '❌ FAIL: recalc_monthly_report has ' || array_length(proargtypes, 1) || ' parameters'
  END AS test_result
FROM pg_proc
WHERE proname = 'recalc_monthly_report'
  AND pronamespace = 'public'::regnamespace;

-- 9. Sample reports with user_id (verify backfill worked)
SELECT 
  id,
  month_start,
  user_id,
  total_income,
  total_expense,
  net
FROM public.reports
ORDER BY month_start DESC
LIMIT 5;

-- ========================================
-- TROUBLESHOOTING QUERIES
-- ========================================

-- If any reports have NULL user_id, investigate:
-- SELECT id, month_start FROM public.reports WHERE user_id IS NULL;

-- Check if related payments/expenses exist:
-- SELECT p.user_id, COUNT(*) 
-- FROM public.payments p
-- WHERE EXTRACT(YEAR FROM p.payment_date) = 2024
--   AND EXTRACT(MONTH FROM p.payment_date) = 12
-- GROUP BY p.user_id;

-- Test manual recalc (replace UUID with actual user_id):
-- SELECT public.recalc_monthly_report(2024, 12, '00000000-0000-0000-0000-000000000000'::uuid);
