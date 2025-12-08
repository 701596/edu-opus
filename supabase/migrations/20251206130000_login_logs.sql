-- Create login_logs table
CREATE TABLE IF NOT EXISTS login_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    email TEXT,
    role TEXT,
    school_id UUID,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying
CREATE INDEX IF NOT EXISTS idx_login_logs_school ON login_logs(school_id);
CREATE INDEX IF NOT EXISTS idx_login_logs_created ON login_logs(created_at DESC);

-- RLS
ALTER TABLE login_logs ENABLE ROW LEVEL SECURITY;

-- Principals can view logs for their school
DROP POLICY IF EXISTS login_logs_select ON login_logs;
CREATE POLICY login_logs_select ON login_logs FOR SELECT
USING (is_school_principal(school_id));

-- RPC to log login
CREATE OR REPLACE FUNCTION log_login(
    p_school_id UUID,
    p_role TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO login_logs (user_id, email, role, school_id, created_at)
    VALUES (
        auth.uid(),
        (SELECT email FROM auth.users WHERE id = auth.uid()),
        p_role,
        p_school_id,
        NOW()
    );
END;
$$;

GRANT SELECT, INSERT ON login_logs TO authenticated;
GRANT EXECUTE ON FUNCTION log_login TO authenticated;
