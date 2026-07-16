-- ===================================================================
-- SellerPlus OS — Phase 10.5: Security Hardening
-- Migration: 20260717_fix_exec_sql_security.sql
-- ===================================================================

-- ─── Fix exec_sql security context ─────────────────────────────────
-- The previous definition used SECURITY DEFINER, which bypassed RLS
-- when executing AI-generated queries. To fix this securely while supporting
-- backend service roles, we explicitly drop privileges to the `authenticated` role
-- and set the request.jwt.claim.sub context so RLS policies are rigorously enforced.

CREATE OR REPLACE FUNCTION public.exec_sql(sql text, active_user_id uuid)
RETURNS jsonb AS $$
BEGIN
  -- Explicitly assume the standard user role to enforce Row Level Security
  SET LOCAL ROLE authenticated;
  
  -- Inject the provided user ID into the auth.uid() context for RLS evaluation
  PERFORM set_config('request.jwt.claim.sub', active_user_id::text, true);

  -- Execute the raw query under strict RLS isolation
  EXECUTE sql;
  
  RETURN '[]'::jsonb;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
