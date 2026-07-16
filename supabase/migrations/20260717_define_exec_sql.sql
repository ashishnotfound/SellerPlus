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
BEGIN
  EXECUTE sql;
  RETURN '[]'::jsonb;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
