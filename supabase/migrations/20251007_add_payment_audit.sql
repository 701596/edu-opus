-- Create payment_audit table for server-side audit logging of payments
CREATE TABLE IF NOT EXISTS public.payment_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL,
  payment_id UUID NOT NULL,
  method TEXT NOT NULL,
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  amount NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_audit_student_id ON public.payment_audit(student_id);
CREATE INDEX IF NOT EXISTS idx_payment_audit_payment_id ON public.payment_audit(payment_id);
