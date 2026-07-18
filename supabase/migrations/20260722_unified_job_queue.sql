-- Migration: 20260722_unified_job_queue.sql
-- Consolidate bi_jobs and jobs into a single unified queue

-- 1. Drop old bi_jobs (unused dead code)
DROP TABLE IF EXISTS public.bi_jobs CASCADE;

-- 2. Alter existing jobs table to support unified features
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS result JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS schedule_id TEXT;

-- Rename queue_name to job_type
DO $$ BEGIN
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name='jobs' AND column_name='queue_name') THEN
    ALTER TABLE public.jobs RENAME COLUMN queue_name TO job_type;
  END IF;
END $$;

-- Drop old index and recreate with new column name
DROP INDEX IF EXISTS idx_jobs_pending_run_at;
CREATE INDEX idx_jobs_pending_run_at ON public.jobs(job_type, status, run_at) WHERE status = 'pending';

-- Add index for user/workspace job history queries
CREATE INDEX IF NOT EXISTS idx_jobs_user_created ON public.jobs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_workspace_created ON public.jobs(workspace_id, created_at DESC);

-- 3. Replace claim_jobs RPC to use new columns and backoff logic
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
    ORDER BY priority ASC, run_at ASC
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
