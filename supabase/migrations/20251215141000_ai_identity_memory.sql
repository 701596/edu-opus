-- Migration: Hard Identity Memory Layer
-- Separate table for non-negotiable identity facts

CREATE TABLE IF NOT EXISTS public.ai_identity_memory (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT,
    role TEXT,
    authority TEXT, -- e.g. "System Owner", "Principal"
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: Users can read/write their own identity
ALTER TABLE public.ai_identity_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own identity" ON public.ai_identity_memory
    FOR ALL USING (auth.uid() = user_id);

-- Comment
COMMENT ON TABLE public.ai_identity_memory IS 'Single Source of Truth for User Identity. Not summarized, not truncated.';
