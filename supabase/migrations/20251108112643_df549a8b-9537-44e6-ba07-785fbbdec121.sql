-- Add category field to payments table
ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS category text DEFAULT 'school_fee';