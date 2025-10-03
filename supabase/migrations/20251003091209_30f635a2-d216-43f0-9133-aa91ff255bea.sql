-- Add class column to students table
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS class text;

-- Make some fields nullable since they're optional
ALTER TABLE public.students ALTER COLUMN email DROP NOT NULL;
ALTER TABLE public.students ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE public.students ALTER COLUMN address DROP NOT NULL;
ALTER TABLE public.students ALTER COLUMN date_of_birth DROP NOT NULL;
ALTER TABLE public.students ALTER COLUMN guardian_name DROP NOT NULL;
ALTER TABLE public.students ALTER COLUMN guardian_phone DROP NOT NULL;

-- Make staff fields optional
ALTER TABLE public.staff ALTER COLUMN email DROP NOT NULL;
ALTER TABLE public.staff ALTER COLUMN address DROP NOT NULL;
ALTER TABLE public.staff ALTER COLUMN department DROP NOT NULL;