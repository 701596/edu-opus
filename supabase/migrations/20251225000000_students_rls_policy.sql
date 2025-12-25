-- Migration: Enable RLS on students table
-- Purpose: Fix critical tenant isolation breach
-- Date: 2025-12-25
-- Risk: LOW - Additive only, uses existing user_id column

-- Enable RLS on students table
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

-- Allow users to select only their own students (user_id based isolation)
CREATE POLICY "Users can view own students"
    ON public.students
    FOR SELECT
    USING (auth.uid() = user_id);

-- Allow users to insert students for themselves
CREATE POLICY "Users can insert own students"
    ON public.students
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Allow users to update only their own students
CREATE POLICY "Users can update own students"
    ON public.students
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Allow users to delete only their own students
CREATE POLICY "Users can delete own students"
    ON public.students
    FOR DELETE
    USING (auth.uid() = user_id);
