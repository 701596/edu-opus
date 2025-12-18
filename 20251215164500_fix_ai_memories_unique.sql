-- Fix: Add UNIQUE constraint to ai_memories.user_id to support UPSERT

-- 1. Deduplicate existing rows (keep latest updated_at)
DELETE FROM public.ai_memories
WHERE id IN (
    SELECT id
    FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY updated_at DESC) as rn
        FROM public.ai_memories
    ) t
    WHERE t.rn > 1
);

-- 2. Add Unique Constraint
ALTER TABLE public.ai_memories ADD CONSTRAINT ai_memories_user_id_key UNIQUE (user_id);
