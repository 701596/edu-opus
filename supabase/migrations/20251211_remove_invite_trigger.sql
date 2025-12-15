DROP TRIGGER IF EXISTS on_auth_user_created_process_invite ON auth.users;
DROP FUNCTION IF EXISTS public.process_new_user_invite();
