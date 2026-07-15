-- ===================================================================
-- SellerPlus OS — Phase 9 Production Gap Analysis Fixes
-- Migration: 20260717_define_exec_sql.sql
-- ===================================================================

-- ─── Define exec_sql utility function ──────────────────────────────
-- Required by AI Chat assistant and database migration APIs.
-- Marked as SECURITY DEFINER to execute arbitrary SELECT queries on behalf
-- of authenticated users (the query parser enforces the tenant isolation).
CREATE OR REPLACE FUNCTION public.exec_sql(sql text)
RETURNS jsonb AS $$
DECLARE
  result jsonb;
BEGIN
  -- Strict safety checks should still be performed at the API layer.
  -- Wraps query execution to format output as aggregated JSONB.
  EXECUTE 'SELECT coalesce(json_agg(t)::jsonb, ''[]''::jsonb) FROM (' || sql || ') t' INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
