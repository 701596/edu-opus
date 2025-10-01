-- Add currency support
CREATE TABLE IF NOT EXISTS public.settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Create policy for settings
CREATE POLICY "Allow all operations for authenticated users" ON public.settings FOR ALL USING (true) WITH CHECK (true);

-- Insert default currency setting
INSERT INTO public.settings (key, value)
VALUES ('currency', '{"code": "USD", "symbol": "$", "name": "US Dollar"}')
ON CONFLICT (key) DO NOTHING;

-- Add trigger for updated_at
CREATE TRIGGER update_settings_updated_at 
BEFORE UPDATE ON public.settings 
FOR EACH ROW 
EXECUTE FUNCTION public.update_updated_at_column();