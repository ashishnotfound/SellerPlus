-- Migration: 20260721_claim_jobs_rpc.sql

CREATE OR REPLACE FUNCTION public.claim_jobs(batch_size INT)
RETURNS SETOF public.jobs AS $$
BEGIN
  RETURN QUERY
  UPDATE public.jobs
  SET status = 'running', updated_at = timezone('utc'::text, now())
  WHERE id IN (
    SELECT id
    FROM public.jobs
    WHERE status = 'pending' AND run_at <= timezone('utc'::text, now())
    ORDER BY priority DESC, run_at ASC
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Only service_role can claim jobs
REVOKE ALL ON FUNCTION public.claim_jobs(INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_jobs(INT) FROM anon;
REVOKE ALL ON FUNCTION public.claim_jobs(INT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_jobs(INT) TO service_role;

NOTIFY pgrst, 'reload schema';
