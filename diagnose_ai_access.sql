-- =============================================
-- DIAGNOSTIC: Check Principal Access Data
-- Run this in Supabase SQL Editor to debug the issue
-- =============================================

-- 1. Check current user's school_members entries
SELECT 
    sm.user_id,
    sm.school_id,
    sm.role,
    sm.is_active,
    u.email,
    u.raw_user_meta_data->>'role' as metadata_role
FROM public.school_members sm
JOIN auth.users u ON u.id = sm.user_id
ORDER BY sm.created_at DESC
LIMIT 20;

-- 2. Find ALL users with 'principal' anywhere
SELECT 
    id as user_id,
    email,
    raw_user_meta_data->>'role' as metadata_role,
    raw_user_meta_data->>'school_id' as metadata_school_id
FROM auth.users
WHERE LOWER(raw_user_meta_data->>'role') LIKE '%principal%'
   OR raw_user_meta_data->>'role' IS NULL;

-- 3. Check if ai_memories table exists and has correct structure
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'ai_memories';

-- 4. Check RLS policies on ai_memories
SELECT * FROM pg_policies WHERE tablename = 'ai_memories';

-- 5. Manual principal check - replace YOUR_USER_ID with actual ID
-- SELECT * FROM public.school_members WHERE user_id = 'YOUR_USER_ID';
