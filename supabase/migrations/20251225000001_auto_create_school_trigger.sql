CREATE OR REPLACE FUNCTION public.handle_new_user_school_creation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_school_id uuid;
  user_full_name text;
BEGIN
  -- Idempotency Check: If user is already a member of ANY school, exit.
  IF EXISTS (SELECT 1 FROM public.school_members WHERE user_id = new.id) THEN
    RETURN new;
  END IF;

  -- Determine School Name (Metadata 'full_name' or default 'My')
  user_full_name := COALESCE(new.raw_user_meta_data->>'full_name', 'My');

  -- Create School (on_school_created trigger handles school_members insertion automatically)
  INSERT INTO public.schools (name, owner_id)
  VALUES (user_full_name || '''s School', new.id)
  RETURNING id INTO new_school_id;

  -- NOTE: school_members row is created by on_school_created -> handle_new_school_owner trigger

  -- Upsert Profile
  INSERT INTO public.profiles (id, school_id, role)
  VALUES (new.id, new_school_id, 'principal')
  ON CONFLICT (id) DO UPDATE
  SET school_id = EXCLUDED.school_id,
      role = EXCLUDED.role
  WHERE profiles.school_id IS NULL;

  RETURN new;
EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_school ON auth.users;

CREATE TRIGGER on_auth_user_created_school
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_school_creation();
