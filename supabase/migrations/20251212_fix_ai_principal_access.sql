-- =============================================
-- MIGRATION: Fix AI Principal Access
-- Description: Normalizes roles and ensures principals exist in school_members
-- =============================================

-- 1. Normalize existing roles to lowercase
UPDATE public.school_members
SET role = LOWER(TRIM(role::text))::user_role
WHERE role IS NOT NULL;

-- 2. Ensure all principals from auth.users exist in school_members
-- This handles cases where principal exists only in user metadata
DO $$
DECLARE
    r RECORD;
    v_school_id UUID;
BEGIN
    -- Find users who have principal in their metadata but aren't in school_members
    FOR r IN 
        SELECT id, raw_user_meta_data->>'school_id' as meta_school_id
        FROM auth.users
        WHERE LOWER(TRIM(raw_user_meta_data->>'role')) = 'principal'
    LOOP
        -- Check if they already exist in school_members
        IF NOT EXISTS (
            SELECT 1 FROM public.school_members 
            WHERE user_id = r.id AND role = 'principal'
        ) THEN
            -- Get the school_id from metadata or find their school
            v_school_id := (r.meta_school_id)::UUID;
            
            -- If no school_id in metadata, try to find from existing records
            IF v_school_id IS NULL THEN
                SELECT school_id INTO v_school_id
                FROM public.school_members
                WHERE user_id = r.id
                LIMIT 1;
            END IF;
            
            -- Insert if we have a school_id
            IF v_school_id IS NOT NULL THEN
                INSERT INTO public.school_members (user_id, school_id, role, is_active)
                VALUES (r.id, v_school_id, 'principal', true)
                ON CONFLICT (user_id, school_id) DO UPDATE SET role = 'principal';
            END IF;
        END IF;
    END LOOP;
END $$;

-- 3. Create a helper function for robust principal check
CREATE OR REPLACE FUNCTION public.is_user_principal(p_user_id UUID DEFAULT NULL)
RETURNS TABLE (is_principal BOOLEAN, school_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
BEGIN
    v_user_id := COALESCE(p_user_id, auth.uid());
    
    -- Check school_members with normalized role
    RETURN QUERY
    SELECT 
        true AS is_principal,
        sm.school_id
    FROM public.school_members sm
    WHERE sm.user_id = v_user_id
    AND LOWER(TRIM(sm.role::text)) = 'principal'
    AND sm.is_active = true
    LIMIT 1;
    
    -- If no result, return false
    IF NOT FOUND THEN
        RETURN QUERY SELECT false, NULL::UUID;
    END IF;
END;
$$;

-- 4. Update AI memories RLS to use the helper function
DROP POLICY IF EXISTS "Principals manage own AI memories" ON public.ai_memories;

CREATE POLICY "Principals manage own AI memories" ON public.ai_memories
    FOR ALL USING (
        user_id = auth.uid() AND 
        EXISTS (
            SELECT 1 FROM public.school_members
            WHERE user_id = auth.uid()
            AND LOWER(TRIM(role::text)) = 'principal'
            AND is_active = true
        )
    );

-- 5. Update AI audit logs RLS
DROP POLICY IF EXISTS "Principals view own audit logs" ON public.ai_audit_logs;
DROP POLICY IF EXISTS "System inserts audit logs" ON public.ai_audit_logs;

CREATE POLICY "Principals view own audit logs" ON public.ai_audit_logs
    FOR SELECT USING (
        user_id = auth.uid() AND 
        EXISTS (
            SELECT 1 FROM public.school_members
            WHERE user_id = auth.uid()
            AND LOWER(TRIM(role::text)) = 'principal'
            AND is_active = true
        )
    );

CREATE POLICY "System inserts audit logs" ON public.ai_audit_logs
    FOR INSERT WITH CHECK (true);

-- 6. Update AI pending writes RLS
DROP POLICY IF EXISTS "Principals manage own pending writes" ON public.ai_pending_writes;

CREATE POLICY "Principals manage own pending writes" ON public.ai_pending_writes
    FOR ALL USING (
        user_id = auth.uid() AND 
        EXISTS (
            SELECT 1 FROM public.school_members
            WHERE user_id = auth.uid()
            AND LOWER(TRIM(role::text)) = 'principal'
            AND is_active = true
        )
    );
