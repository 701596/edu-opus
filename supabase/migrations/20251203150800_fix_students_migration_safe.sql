-- SAFE MIGRATION: Fix students table with trigger management
-- This migration disables USER triggers (not system triggers) during modification
-- System triggers (foreign keys) remain active for data integrity

BEGIN;

-- 1. Disable USER triggers only (system triggers stay active)
ALTER TABLE public.students DISABLE TRIGGER USER;

-- 2. Create table if missing (with essential columns)
CREATE TABLE IF NOT EXISTS public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  email text,
  phone text,
  class text,
  remaining_fee numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. Add missing columns safely (idempotent)
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- 4. Populate search_vector for existing rows
UPDATE public.students
SET search_vector = to_tsvector('simple',
    coalesce(name,'') || ' ' || coalesce(email,'') || ' ' || coalesce(phone,'')
)
WHERE search_vector IS NULL;

-- 5. Trigger function to keep search_vector up-to-date
CREATE OR REPLACE FUNCTION public.students_search_vector_trigger()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('simple',
     coalesce(NEW.name,'') || ' ' || coalesce(NEW.email,'') || ' ' || coalesce(NEW.phone,'')
  );
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Create/replace trigger
DROP TRIGGER IF EXISTS students_search_vector_update ON public.students;
CREATE TRIGGER students_search_vector_update
BEFORE INSERT OR UPDATE ON public.students
FOR EACH ROW EXECUTE FUNCTION public.students_search_vector_trigger();

-- 7. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_students_created_at ON public.students(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_students_search_vector ON public.students USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_students_user_id ON public.students(user_id);

-- 8. Re-enable USER triggers
ALTER TABLE public.students ENABLE TRIGGER USER;

COMMIT;
