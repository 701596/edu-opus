-- Migration: AI Sessions Support
-- Supports multiple persistent conversations per user

CREATE TABLE IF NOT EXISTS public.ai_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT DEFAULT 'New Conversation',
    messages JSONB DEFAULT '[]'::jsonb, -- Full history for this session
    summary TEXT, -- Long-term summary for this specific session
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own conversations" ON public.ai_conversations
    FOR ALL USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS ai_conversations_user_id_idx ON public.ai_conversations(user_id);
CREATE INDEX IF NOT EXISTS ai_conversations_updated_at_idx ON public.ai_conversations(updated_at DESC);
