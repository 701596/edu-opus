-- PHASE 1: CLEANUP LEGACY TRIGGERS AND FUNCTIONS
-- This must be run FIRST to remove broken snapshot and remaining_fee logic

-- ============================================
-- STEP 1: Drop snapshot triggers (causing "relation does not exist" errors)
-- ============================================
DROP TRIGGER IF EXISTS tr_payments_snapshot ON payments;
DROP TRIGGER IF EXISTS tr_fee_folders_snapshot ON fee_folders;

-- ============================================
-- STEP 2: Drop legacy remaining_fee triggers
-- ============================================
DROP TRIGGER IF EXISTS trg_update_student_fee ON payments;
DROP TRIGGER IF EXISTS update_student_fees_on_payment_change_trigger ON payments;
DROP TRIGGER IF EXISTS tr_recalculate_on_payment_change ON payments;
DROP TRIGGER IF EXISTS tr_recalculate_on_fee_folder_change ON fee_folders;

-- ============================================
-- STEP 3: Drop orphaned functions
-- ============================================
DROP FUNCTION IF EXISTS queue_snapshot_recalc() CASCADE;
DROP FUNCTION IF EXISTS update_student_remaining_fee() CASCADE;
DROP FUNCTION IF EXISTS update_student_fees_on_payment_change() CASCADE;
DROP FUNCTION IF EXISTS on_payment_change_recalc() CASCADE;
DROP FUNCTION IF EXISTS on_fee_folder_change_recalc() CASCADE;

-- ============================================
-- STEP 4: Verify cleanup
-- ============================================
SELECT 'Remaining triggers on payments:' AS info;
SELECT tgname FROM pg_trigger WHERE tgrelid = 'payments'::regclass AND NOT tgisinternal;

SELECT 'Remaining triggers on fee_folders:' AS info;
SELECT tgname FROM pg_trigger WHERE tgrelid = 'fee_folders'::regclass AND NOT tgisinternal;

-- ============================================
-- STEP 5: Confirm snapshot table does not exist
-- ============================================
SELECT 'Snapshot tables (should be empty):' AS info;
SELECT tablename FROM pg_tables WHERE tablename ILIKE '%snapshot%';
