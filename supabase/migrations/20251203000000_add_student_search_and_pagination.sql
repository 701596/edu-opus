-- Migration: Add full-text search and pagination support to students table
-- Date: 2025-12-03

-- Add search_vector column for full-text search
ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Create function to update search_vector
CREATE OR REPLACE FUNCTION public.update_students_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.student_id, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.email, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.class, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.guardian_name, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.guardian_phone, '')), 'D') ||
    setweight(to_tsvector('english', COALESCE(NEW.phone, '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for search_vector updates
DROP TRIGGER IF EXISTS students_search_vector_update ON public.students;
CREATE TRIGGER students_search_vector_update
  BEFORE INSERT OR UPDATE OF name, student_id, email, class, guardian_name, guardian_phone, phone
  ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.update_students_search_vector();

-- Create GIN index for full-text search (critical for performance)
CREATE INDEX IF NOT EXISTS idx_students_search_vector 
  ON public.students 
  USING GIN(search_vector);

-- Create index for pagination with created_at DESC (most recent first)
CREATE INDEX IF NOT EXISTS idx_students_created_at_desc 
  ON public.students (created_at DESC);

-- Create composite index for user_id + created_at for multi-tenant pagination
CREATE INDEX IF NOT EXISTS idx_students_user_id_created_at 
  ON public.students (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- Create composite index for user_id + search for multi-tenant search
CREATE INDEX IF NOT EXISTS idx_students_user_id_search 
  ON public.students (user_id)
  INCLUDE (search_vector)
  WHERE user_id IS NOT NULL;

-- Backfill search_vector for existing students
UPDATE public.students
SET search_vector = 
  setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(student_id, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(email, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(class, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(guardian_name, '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(guardian_phone, '')), 'D') ||
  setweight(to_tsvector('english', COALESCE(phone, '')), 'D')
WHERE search_vector IS NULL;

-- Add comment to document the search functionality
COMMENT ON COLUMN public.students.search_vector IS 
  'Full-text search vector. Weights: A=name,student_id; B=email,class; C=guardian_name; D=phone';

COMMENT ON TRIGGER students_search_vector_update ON public.students IS 
  'Automatically updates search_vector on INSERT/UPDATE for full-text search';
