-- Helper to list triggers
CREATE OR REPLACE FUNCTION get_table_triggers(table_name text)
RETURNS TABLE(trigger_name text, event_manipulation text, action_statement text)
LANGUAGE sql
AS $$
  SELECT trigger_name, event_manipulation, action_statement
  FROM information_schema.triggers
  WHERE event_object_table = table_name;
$$;
