-- =============================================
-- MANUAL FIX: Set User as Principal
-- User ID: a8be9227-7dc8-4268-a622-49417bfd8cba
-- =============================================

UPDATE public.school_members
SET role = 'principal'
WHERE user_id = 'a8be9227-7dc8-4268-a622-49417bfd8cba';

-- Verify the change (optional, helps to see output)
SELECT * FROM public.school_members 
WHERE user_id = 'a8be9227-7dc8-4268-a622-49417bfd8cba';
