-- ========================================
-- POST-MIGRATION VERIFICATION SCRIPT
-- Run this after applying the migration
-- ========================================

-- 1. Verify table exists
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = 'students'
        ) 
        THEN '✅ Table exists' 
        ELSE '❌ Table missing' 
    END AS table_check;

-- 2. Verify all required columns exist
SELECT 
    column_name,
    data_type,
    CASE WHEN is_nullable = 'NO' THEN 'NOT NULL' ELSE 'NULL' END AS nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'students'
ORDER BY ordinal_position;

-- Expected columns:
-- id, user_id, name, email, phone, class, remaining_fee, 
-- created_at, updated_at, search_vector, metadata

-- 3. Verify indexes
SELECT 
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'students' AND schemaname = 'public'
ORDER BY indexname;

-- Expected indexes:
-- idx_students_created_at (created_at DESC)
-- idx_students_search_vector (GIN)
-- idx_students_user_id (user_id)

-- 4. Verify trigger exists
SELECT 
    trigger_name,
    event_manipulation,
    action_statement
FROM information_schema.triggers
WHERE event_object_table = 'students' AND event_object_schema = 'public';

-- Expected trigger: students_search_vector_update

-- 5. Count existing students
SELECT 
    COUNT(*) AS total_students,
    COUNT(search_vector) AS students_with_search_vector,
    COUNT(*) - COUNT(search_vector) AS students_missing_search_vector
FROM public.students;

-- 6. Test search_vector content (sample)
SELECT 
    id,
    name,
    email,
    phone,
    search_vector
FROM public.students
LIMIT 5;

-- 7. Test full-text search functionality
-- (Replace 'test' with actual student name if you have data)
SELECT 
    name,
    email,
    ts_rank(search_vector, to_tsquery('simple', 'test:*')) AS rank
FROM public.students
WHERE search_vector @@ to_tsquery('simple', 'test:*')
ORDER BY rank DESC
LIMIT 10;

-- ========================================
-- EXPECTED OUTPUT
-- ========================================
-- ✅ All columns present
-- ✅ 3 indexes created
-- ✅ 1 trigger created
-- ✅ search_vector populated for existing rows
-- ✅ Full-text search working

-- ========================================
-- TROUBLESHOOTING
-- ========================================

-- If search_vector is NULL for some rows, run:
-- UPDATE public.students
-- SET search_vector = to_tsvector('simple',
--     coalesce(name,'') || ' ' || coalesce(email,'') || ' ' || coalesce(phone,'')
-- )
-- WHERE search_vector IS NULL;

-- If indexes are missing, run:
-- CREATE INDEX IF NOT EXISTS idx_students_created_at ON public.students(created_at DESC);
-- CREATE INDEX IF NOT EXISTS idx_students_search_vector ON public.students USING GIN(search_vector);
-- CREATE INDEX IF NOT EXISTS idx_students_user_id ON public.students(user_id);
