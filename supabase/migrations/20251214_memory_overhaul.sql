-- Migration: Memory System Overhaul
-- Adds identity_memory column for persistent user tracking

ALTER TABLE public.ai_memories 
ADD COLUMN IF NOT EXISTS identity_memory JSONB DEFAULT '{}'::jsonb;

-- Comment on column
COMMENT ON COLUMN public.ai_memories.identity_memory IS 'Persistent identity attributes: user_name, user_role, preferred_tone, assistant_persona';
