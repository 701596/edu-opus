-- =============================================
-- MIGRATION: FORCE CLEANUP of Invite System
-- Purpose: Final sweep to drop any lingering invite objects
-- =============================================

BEGIN;

-- 1. DROP Tables (using CASCADE to kill policies/indexes)
DROP TABLE IF EXISTS public.school_invites CASCADE;
DROP TABLE IF EXISTS public.invite_audit CASCADE;

-- 2. DROP Types
DROP TYPE IF EXISTS public.invite_status CASCADE;

-- 3. DROP Functions (All variants known)
DROP FUNCTION IF EXISTS public.create_school_invite(uuid, text, user_role, integer);
DROP FUNCTION IF EXISTS public.create_school_invite(uuid, text, user_role);
DROP FUNCTION IF EXISTS public.get_school_invites(uuid);
DROP FUNCTION IF EXISTS public.revoke_school_invite(uuid);
DROP FUNCTION IF EXISTS public.accept_school_invite(text, uuid);
DROP FUNCTION IF EXISTS public.accept_school_invite_by_code(text, uuid);
DROP FUNCTION IF EXISTS public.accept_invite(text, text);
DROP FUNCTION IF EXISTS public.get_invite_by_token(text);
DROP FUNCTION IF EXISTS public.accept_invite_by_email_and_code(text, text);

-- Legacy/Development variants
DROP FUNCTION IF EXISTS public.create_invite_secure(uuid, text, user_role);
DROP FUNCTION IF EXISTS public.accept_invite_by_code(text, uuid);
DROP FUNCTION IF EXISTS public.get_school_invites_secure(uuid);
DROP FUNCTION IF EXISTS public.revoke_invite_secure(uuid);

-- 4. DROP Triggers (Safe attempt)
-- Note: Trigger drops require knowing the specific table they are attached to.
-- Most were on school_invites (gone).
-- Checking auth.users or others:
DROP TRIGGER IF EXISTS on_auth_user_created_process_invite ON auth.users;
DROP FUNCTION IF EXISTS public.process_invite_for_new_user();

COMMIT;
