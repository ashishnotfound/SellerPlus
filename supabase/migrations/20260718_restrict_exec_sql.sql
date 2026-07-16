 -- ===================================================================
-- SellerPlus OS — Phase 10.5 Security Hardening
-- Migration: 20260718_restrict_exec_sql.sql
-- ===================================================================

DO $$
BEGIN
  -- Hardening public.exec_sql(text) if exists
  IF EXISTS (
    SELECT 1 FROM pg_proc p 
    JOIN pg_namespace n ON p.pronamespace = n.oid 
    WHERE n.nspname = 'public' AND p.proname = 'exec_sql' AND oidvectortypes(p.proargtypes) = 'text'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.exec_sql(text) FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.exec_sql(text) FROM anon;
    REVOKE EXECUTE ON FUNCTION public.exec_sql(text) FROM authenticated;
    GRANT EXECUTE ON FUNCTION public.exec_sql(text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.exec_sql(text) TO postgres;
  END IF;

  -- Hardening public.exec_sql(text, uuid) if exists
  IF EXISTS (
    SELECT 1 FROM pg_proc p 
    JOIN pg_namespace n ON p.pronamespace = n.oid 
    WHERE n.nspname = 'public' AND p.proname = 'exec_sql' AND oidvectortypes(p.proargtypes) = 'text, uuid'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.exec_sql(text, uuid) FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.exec_sql(text, uuid) FROM anon;
    REVOKE EXECUTE ON FUNCTION public.exec_sql(text, uuid) FROM authenticated;
    GRANT EXECUTE ON FUNCTION public.exec_sql(text, uuid) TO service_role;
    GRANT EXECUTE ON FUNCTION public.exec_sql(text, uuid) TO postgres;
  END IF;
END
$$;

-- Re-notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
