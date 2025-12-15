-- =============================================
-- MIGRATION: Auto-Process Invite on Signup
-- Description: Trigger to link user to school based on metadata token/code
-- =============================================

BEGIN;

-- 1. Create the Trigger Function
CREATE OR REPLACE FUNCTION public.process_new_user_invite()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_token TEXT;
    v_code TEXT;
    v_school_id UUID;
    v_role user_role;
    v_meta JSONB;
BEGIN
    v_meta := NEW.raw_user_meta_data;
    
    -- Extract potential invite data
    v_token := v_meta->>'invite_token';
    v_code := v_meta->>'invite_code';

    -- If no invite data, just return
    IF v_token IS NULL AND v_code IS NULL THEN
        RETURN NEW;
    END IF;

    -- A. Process Token
    IF v_token IS NOT NULL THEN
        SELECT school_id, role INTO v_school_id, v_role
        FROM invitations
        WHERE token = v_token AND used_at IS NULL AND expires_at > now();

        IF v_school_id IS NOT NULL THEN
            -- Mark Used
            UPDATE invitations SET used_at = now() WHERE token = v_token;
        END IF;

    -- B. Process Code
    ELSIF v_code IS NOT NULL THEN
        SELECT school_id, role INTO v_school_id, v_role
        FROM invitation_codes
        WHERE code = v_code AND used_at IS NULL AND expires_at > now();

        IF v_school_id IS NOT NULL THEN
            -- Mark Used
            UPDATE invitation_codes SET used_at = now() WHERE code = v_code;
        END IF;
    END IF;

    -- C. Assign Membership (If valid invite found)
    IF v_school_id IS NOT NULL THEN
        INSERT INTO school_members (school_id, user_id, role, is_active)
        VALUES (v_school_id, NEW.id, v_role, true)
        ON CONFLICT (school_id, user_id) 
        DO UPDATE SET role = v_role, is_active = true;
    END IF;

    RETURN NEW;
END;
$$;

-- 2. Create Trigger on auth.users
-- We drop if exists to be idempotent
DROP TRIGGER IF EXISTS on_auth_user_created_process_invite ON auth.users;

CREATE TRIGGER on_auth_user_created_process_invite
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.process_new_user_invite();

COMMIT;
