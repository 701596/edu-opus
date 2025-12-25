-- SNAPSHOT SYSTEM ERADICATION SCRIPT
-- This script removes ALL snapshot-related database objects

-- Step 1: Drop triggers that might reference snapshots
DROP TRIGGER IF EXISTS update_snapshot_on_fee_folder_change ON fee_folders;
DROP TRIGGER IF EXISTS update_snapshot_on_payment_change ON payments;
DROP TRIGGER IF EXISTS update_snapshot_on_student_change ON students;
DROP TRIGGER IF EXISTS recalculate_snapshot_trigger ON fee_folders;
DROP TRIGGER IF EXISTS recalculate_snapshot_trigger ON payments;
DROP TRIGGER IF EXISTS update_financial_snapshot_trigger ON fee_folders;
DROP TRIGGER IF EXISTS update_financial_snapshot_trigger ON payments;
DROP TRIGGER IF EXISTS sync_financial_snapshot ON fee_folders;
DROP TRIGGER IF EXISTS sync_financial_snapshot ON payments;

-- Step 2: Drop functions that might manage snapshots
DROP FUNCTION IF EXISTS update_school_financial_snapshot() CASCADE;
DROP FUNCTION IF EXISTS recalculate_financial_snapshot() CASCADE;
DROP FUNCTION IF EXISTS sync_financial_snapshot() CASCADE;
DROP FUNCTION IF EXISTS update_financial_snapshot() CASCADE;
DROP FUNCTION IF EXISTS calculate_financial_snapshot() CASCADE;
DROP FUNCTION IF EXISTS refresh_financial_snapshot() CASCADE;

-- Step 3: Drop the snapshot table if it exists (it shouldn't, but ensure cleanup)
DROP TABLE IF EXISTS school_financial_snapshots CASCADE;
DROP TABLE IF EXISTS financial_snapshots CASCADE;

-- Step 4: Verify no remaining snapshot references
-- This query will show any remaining triggers on fee_folders and payments
SELECT 
    tgname AS trigger_name,
    tgrelid::regclass AS table_name,
    proname AS function_name
FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE tgrelid IN ('fee_folders'::regclass, 'payments'::regclass)
AND NOT tgisinternal;

-- Step 5: List all functions containing 'snapshot' in their name or definition
SELECT 
    proname AS function_name,
    prosrc AS function_body
FROM pg_proc
WHERE proname ILIKE '%snapshot%'
   OR prosrc ILIKE '%snapshot%';

-- Run this script in Supabase SQL Editor to purge all snapshot references
