-- Quick fix for payments page
-- Run this in Supabase SQL Editor

-- The issue: ambiguous foreign key relationship
-- Solution: Check if there are multiple FKs from payments to students

SELECT 
  conname AS constraint_name,
  conrelid::regclass AS from_table,
  confrelid::regclass AS to_table,
  a.attname AS from_column
FROM pg_constraint
JOIN pg_attribute a ON a.attnum = ANY(conkey) AND a.attrelid = conrelid
WHERE contype = 'f'
  AND conrelid = 'public.payments'::regclass
  AND confrelid = 'public.students'::regclass;
