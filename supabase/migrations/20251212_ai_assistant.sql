-- =============================================
-- MIGRATION: AI Assistant System
-- Description: Tables for AI memory, audit logs, and pending writes
-- =============================================

-- 1. AI Memories (Conversation History)
CREATE TABLE IF NOT EXISTS public.ai_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
    messages JSONB DEFAULT '[]'::jsonb, -- Last 100 messages
    summary TEXT, -- Running context summary
    memory_version INTEGER DEFAULT 1, -- For evolving memory system
    last_scrape_at TIMESTAMPTZ, -- Last time data was fetched for context
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. AI Audit Logs (Track all AI queries)
CREATE TABLE IF NOT EXISTS public.ai_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    school_id UUID REFERENCES public.schools(id),
    query TEXT NOT NULL,
    response TEXT,
    action_type TEXT DEFAULT 'read', -- 'read' or 'write_requested'
    tokens_used INTEGER,
    model_used TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. AI Pending Writes (Safe write confirmations)
CREATE TABLE IF NOT EXISTS public.ai_pending_writes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    school_id UUID REFERENCES public.schools(id),
    action_type TEXT NOT NULL, -- 'add_student', 'update_attendance', etc.
    action_data JSONB NOT NULL, -- The actual data to write
    action_summary TEXT NOT NULL, -- Human-readable summary
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '5 minutes'),
    confirmed BOOLEAN DEFAULT FALSE,
    executed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_ai_memories_user ON public.ai_memories(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_audit_logs_user ON public.ai_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_pending_writes_user ON public.ai_pending_writes(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_pending_writes_expires ON public.ai_pending_writes(expires_at) WHERE NOT confirmed;

-- 5. RLS Policies
ALTER TABLE public.ai_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_pending_writes ENABLE ROW LEVEL SECURITY;

-- Helper: Check if user is principal
CREATE OR REPLACE FUNCTION public.is_principal()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.school_members
        WHERE user_id = auth.uid()
        AND role = 'principal'
        AND is_active = true
    );
$$;

-- AI Memories: Only principals can access their own
CREATE POLICY "Principals manage own AI memories" ON public.ai_memories
    FOR ALL USING (
        user_id = auth.uid() AND public.is_principal()
    );

-- AI Audit Logs: Read-only for principals
CREATE POLICY "Principals view own audit logs" ON public.ai_audit_logs
    FOR SELECT USING (
        user_id = auth.uid() AND public.is_principal()
    );

CREATE POLICY "System inserts audit logs" ON public.ai_audit_logs
    FOR INSERT WITH CHECK (true); -- Edge function will insert

-- AI Pending Writes: Principals manage their own
CREATE POLICY "Principals manage own pending writes" ON public.ai_pending_writes
    FOR ALL USING (
        user_id = auth.uid() AND public.is_principal()
    );

-- 6. Auto-cleanup expired pending writes
CREATE OR REPLACE FUNCTION public.cleanup_expired_pending_writes()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    DELETE FROM public.ai_pending_writes
    WHERE expires_at < NOW() AND NOT confirmed;
END;
$$;
