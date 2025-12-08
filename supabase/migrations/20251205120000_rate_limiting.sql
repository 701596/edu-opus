-- =============================================
-- MIGRATION: Rate Limiting System
-- Version: 1.0.0 - Security & Protection
-- =============================================
-- Creates tables and functions for rate limiting,
-- violation logging, and block management.
-- =============================================

BEGIN;

-- Create security schema if not exists
CREATE SCHEMA IF NOT EXISTS security;

-- =============================================
-- TABLE: Rate Limit Configuration
-- =============================================
CREATE TABLE IF NOT EXISTS security.rate_limit_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint TEXT NOT NULL UNIQUE,
  max_requests INTEGER NOT NULL,
  window_seconds INTEGER NOT NULL,
  burst_limit INTEGER,
  block_duration_seconds INTEGER DEFAULT 3600,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default configurations
INSERT INTO security.rate_limit_config (endpoint, max_requests, window_seconds, burst_limit, block_duration_seconds) VALUES
  ('auth.login', 5, 600, NULL, 3600),
  ('auth.signup', 5, 600, NULL, 3600),
  ('rpc.get_dashboard_summary', 10, 60, 20, 300),
  ('rpc.get_report_summary', 10, 60, 20, 300),
  ('payments.create', 60, 60, 80, 600),
  ('payments.list', 120, 60, NULL, 300),
  ('expenses.create', 60, 60, NULL, 300),
  ('expenses.update', 60, 60, NULL, 300),
  ('students.search', 120, 60, NULL, 300),
  ('staff.search', 120, 60, NULL, 300),
  ('admin.rpc', 2, 3600, NULL, 7200),
  ('public.health', 1000, 60, NULL, 60)
ON CONFLICT (endpoint) DO NOTHING;

-- =============================================
-- TABLE: Rate Limit Violations Log
-- =============================================
CREATE TABLE IF NOT EXISTS security.rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id),
  ip_address TEXT,
  endpoint TEXT NOT NULL,
  method TEXT,
  request_count INTEGER NOT NULL,
  limit_value INTEGER NOT NULL,
  action TEXT NOT NULL, -- 'warn', 'block', 'kill'
  escalation_level INTEGER DEFAULT 1, -- 1=standard, 2=suspicious, 3=kill
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_rate_limits_user_id ON security.rate_limits(user_id);
CREATE INDEX IF NOT EXISTS idx_rate_limits_ip ON security.rate_limits(ip_address);
CREATE INDEX IF NOT EXISTS idx_rate_limits_timestamp ON security.rate_limits(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_rate_limits_endpoint ON security.rate_limits(endpoint);

-- =============================================
-- TABLE: Blocked IPs
-- =============================================
CREATE TABLE IF NOT EXISTS security.blocked_ips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address TEXT NOT NULL UNIQUE,
  reason TEXT,
  blocked_at TIMESTAMPTZ DEFAULT NOW(),
  blocked_until TIMESTAMPTZ NOT NULL,
  escalation_level INTEGER DEFAULT 1,
  violation_count INTEGER DEFAULT 1,
  created_by UUID REFERENCES auth.users(id),
  is_permanent BOOLEAN DEFAULT false,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_blocked_ips_address ON security.blocked_ips(ip_address);
CREATE INDEX IF NOT EXISTS idx_blocked_ips_until ON security.blocked_ips(blocked_until);

-- =============================================
-- TABLE: Blocked Users
-- =============================================
CREATE TABLE IF NOT EXISTS security.blocked_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) UNIQUE,
  reason TEXT,
  blocked_at TIMESTAMPTZ DEFAULT NOW(),
  blocked_until TIMESTAMPTZ NOT NULL,
  escalation_level INTEGER DEFAULT 1,
  violation_count INTEGER DEFAULT 1,
  created_by UUID REFERENCES auth.users(id),
  is_permanent BOOLEAN DEFAULT false,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_blocked_users_user_id ON security.blocked_users(user_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_until ON security.blocked_users(blocked_until);

-- =============================================
-- TABLE: Allowlisted IPs (bypass rate limits)
-- =============================================
CREATE TABLE IF NOT EXISTS security.allowlisted_ips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address TEXT NOT NULL UNIQUE,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- =============================================
-- TABLE: Rate Limit Counters (Server-side tracking)
-- =============================================
CREATE TABLE IF NOT EXISTS security.rate_limit_counters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL, -- format: 'user:{user_id}:{endpoint}' or 'ip:{ip}:{endpoint}'
  count INTEGER DEFAULT 1,
  window_start TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE(key)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_counters_key ON security.rate_limit_counters(key);
CREATE INDEX IF NOT EXISTS idx_rate_limit_counters_expires ON security.rate_limit_counters(expires_at);

-- =============================================
-- FUNCTION: Log Rate Limit Violation
-- =============================================
CREATE OR REPLACE FUNCTION security.log_rate_limit_violation(
  p_user_id UUID,
  p_ip_address TEXT,
  p_endpoint TEXT,
  p_method TEXT,
  p_request_count INTEGER,
  p_limit_value INTEGER,
  p_action TEXT,
  p_escalation_level INTEGER DEFAULT 1,
  p_metadata JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'security'
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO security.rate_limits (
    user_id, ip_address, endpoint, method, 
    request_count, limit_value, action, escalation_level, metadata
  ) VALUES (
    p_user_id, p_ip_address, p_endpoint, p_method,
    p_request_count, p_limit_value, p_action, p_escalation_level, p_metadata
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

-- =============================================
-- FUNCTION: Check and Increment Rate Limit
-- =============================================
CREATE OR REPLACE FUNCTION security.check_rate_limit(
  p_key TEXT,
  p_max_requests INTEGER,
  p_window_seconds INTEGER
)
RETURNS TABLE(allowed BOOLEAN, current_count INTEGER, remaining INTEGER, reset_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'security'
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_window_start TIMESTAMPTZ := v_now - (p_window_seconds || ' seconds')::INTERVAL;
  v_expires_at TIMESTAMPTZ := v_now + (p_window_seconds || ' seconds')::INTERVAL;
  v_count INTEGER;
BEGIN
  -- Clean up expired counters
  DELETE FROM security.rate_limit_counters WHERE expires_at < v_now;
  
  -- Upsert counter
  INSERT INTO security.rate_limit_counters (key, count, window_start, expires_at)
  VALUES (p_key, 1, v_now, v_expires_at)
  ON CONFLICT (key) DO UPDATE SET
    count = CASE 
      WHEN security.rate_limit_counters.window_start < v_window_start THEN 1
      ELSE security.rate_limit_counters.count + 1
    END,
    window_start = CASE 
      WHEN security.rate_limit_counters.window_start < v_window_start THEN v_now
      ELSE security.rate_limit_counters.window_start
    END,
    expires_at = v_expires_at
  RETURNING security.rate_limit_counters.count INTO v_count;
  
  RETURN QUERY SELECT 
    v_count <= p_max_requests AS allowed,
    v_count AS current_count,
    GREATEST(0, p_max_requests - v_count) AS remaining,
    v_expires_at AS reset_at;
END;
$$;

-- =============================================
-- FUNCTION: Block IP
-- =============================================
CREATE OR REPLACE FUNCTION security.block_ip(
  p_ip_address TEXT,
  p_reason TEXT,
  p_duration_seconds INTEGER DEFAULT 3600,
  p_escalation_level INTEGER DEFAULT 1
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'security'
AS $$
DECLARE
  v_block_id UUID;
  v_blocked_until TIMESTAMPTZ := NOW() + (p_duration_seconds || ' seconds')::INTERVAL;
BEGIN
  INSERT INTO security.blocked_ips (ip_address, reason, blocked_until, escalation_level)
  VALUES (p_ip_address, p_reason, v_blocked_until, p_escalation_level)
  ON CONFLICT (ip_address) DO UPDATE SET
    reason = p_reason,
    blocked_until = v_blocked_until,
    escalation_level = GREATEST(security.blocked_ips.escalation_level, p_escalation_level),
    violation_count = security.blocked_ips.violation_count + 1
  RETURNING id INTO v_block_id;
  
  RETURN v_block_id;
END;
$$;

-- =============================================
-- FUNCTION: Block User
-- =============================================
CREATE OR REPLACE FUNCTION security.block_user(
  p_user_id UUID,
  p_reason TEXT,
  p_duration_seconds INTEGER DEFAULT 3600,
  p_escalation_level INTEGER DEFAULT 1
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'security'
AS $$
DECLARE
  v_block_id UUID;
  v_blocked_until TIMESTAMPTZ := NOW() + (p_duration_seconds || ' seconds')::INTERVAL;
BEGIN
  INSERT INTO security.blocked_users (user_id, reason, blocked_until, escalation_level)
  VALUES (p_user_id, p_reason, v_blocked_until, p_escalation_level)
  ON CONFLICT (user_id) DO UPDATE SET
    reason = p_reason,
    blocked_until = v_blocked_until,
    escalation_level = GREATEST(security.blocked_users.escalation_level, p_escalation_level),
    violation_count = security.blocked_users.violation_count + 1
  RETURNING id INTO v_block_id;
  
  RETURN v_block_id;
END;
$$;

-- =============================================
-- FUNCTION: Check if IP is Blocked
-- =============================================
CREATE OR REPLACE FUNCTION security.is_ip_blocked(p_ip_address TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'security'
AS $$
BEGIN
  -- Check allowlist first
  IF EXISTS (SELECT 1 FROM security.allowlisted_ips WHERE ip_address = p_ip_address) THEN
    RETURN false;
  END IF;
  
  -- Check block list
  RETURN EXISTS (
    SELECT 1 FROM security.blocked_ips 
    WHERE ip_address = p_ip_address 
    AND (blocked_until > NOW() OR is_permanent = true)
  );
END;
$$;

-- =============================================
-- FUNCTION: Check if User is Blocked
-- =============================================
CREATE OR REPLACE FUNCTION security.is_user_blocked(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'security'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM security.blocked_users 
    WHERE user_id = p_user_id 
    AND (blocked_until > NOW() OR is_permanent = true)
  );
END;
$$;

-- =============================================
-- FUNCTION: Unblock IP
-- =============================================
CREATE OR REPLACE FUNCTION security.unblock_ip(p_ip_address TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'security'
AS $$
BEGIN
  DELETE FROM security.blocked_ips WHERE ip_address = p_ip_address;
  RETURN FOUND;
END;
$$;

-- =============================================
-- FUNCTION: Unblock User
-- =============================================
CREATE OR REPLACE FUNCTION security.unblock_user(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'security'
AS $$
BEGIN
  DELETE FROM security.blocked_users WHERE user_id = p_user_id;
  RETURN FOUND;
END;
$$;

-- =============================================
-- FUNCTION: Get Rate Limit Stats (Admin)
-- =============================================
CREATE OR REPLACE FUNCTION security.get_rate_limit_stats(
  p_hours INTEGER DEFAULT 24
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'security'
AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'total_violations', (SELECT COUNT(*) FROM security.rate_limits WHERE timestamp > NOW() - (p_hours || ' hours')::INTERVAL),
    'blocks', (SELECT COUNT(*) FROM security.rate_limits WHERE action = 'block' AND timestamp > NOW() - (p_hours || ' hours')::INTERVAL),
    'kills', (SELECT COUNT(*) FROM security.rate_limits WHERE action = 'kill' AND timestamp > NOW() - (p_hours || ' hours')::INTERVAL),
    'warns', (SELECT COUNT(*) FROM security.rate_limits WHERE action = 'warn' AND timestamp > NOW() - (p_hours || ' hours')::INTERVAL),
    'blocked_ips', (SELECT COUNT(*) FROM security.blocked_ips WHERE blocked_until > NOW()),
    'blocked_users', (SELECT COUNT(*) FROM security.blocked_users WHERE blocked_until > NOW()),
    'top_endpoints', (
      SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT endpoint, COUNT(*) as count
        FROM security.rate_limits
        WHERE timestamp > NOW() - (p_hours || ' hours')::INTERVAL
        GROUP BY endpoint
        ORDER BY count DESC
        LIMIT 10
      ) t
    ),
    'recent_violations', (
      SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT id, timestamp, user_id, ip_address, endpoint, action, escalation_level
        FROM security.rate_limits
        WHERE timestamp > NOW() - (p_hours || ' hours')::INTERVAL
        ORDER BY timestamp DESC
        LIMIT 20
      ) t
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- =============================================
-- GRANTS
-- =============================================
GRANT USAGE ON SCHEMA security TO authenticated;
GRANT EXECUTE ON FUNCTION security.log_rate_limit_violation TO authenticated;
GRANT EXECUTE ON FUNCTION security.check_rate_limit TO authenticated;
GRANT EXECUTE ON FUNCTION security.is_ip_blocked TO authenticated;
GRANT EXECUTE ON FUNCTION security.is_user_blocked TO authenticated;
GRANT EXECUTE ON FUNCTION security.get_rate_limit_stats TO authenticated;

-- Admin functions (should be further restricted in production)
GRANT EXECUTE ON FUNCTION security.block_ip TO authenticated;
GRANT EXECUTE ON FUNCTION security.block_user TO authenticated;
GRANT EXECUTE ON FUNCTION security.unblock_ip TO authenticated;
GRANT EXECUTE ON FUNCTION security.unblock_user TO authenticated;

COMMIT;

-- =============================================
-- VERIFICATION
-- =============================================
-- Test the functions:
-- SELECT * FROM security.check_rate_limit('test:user:endpoint', 10, 60);
-- SELECT security.log_rate_limit_violation(NULL, '127.0.0.1', 'test', 'GET', 11, 10, 'warn');
-- SELECT security.get_rate_limit_stats(24);
