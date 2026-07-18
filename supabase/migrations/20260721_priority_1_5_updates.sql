-- Migration: 20260721_priority_1_5_updates.sql
-- Priority 1.5: Execution Audits and Queue Timeouts

-- 1. Add locked_until to jobs
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_jobs_pending_or_stale 
  ON public.jobs(queue_name, status, run_at, locked_until) 
  WHERE status IN ('pending', 'running');

-- 2. Update claim_jobs to handle locks and timeouts
CREATE OR REPLACE FUNCTION public.claim_jobs(batch_size INT, lock_timeout_minutes INT DEFAULT 5)
RETURNS SETOF public.jobs AS $$
BEGIN
  RETURN QUERY
  UPDATE public.jobs
  SET 
    status = 'running', 
    updated_at = timezone('utc'::text, now()),
    locked_until = timezone('utc'::text, now()) + (lock_timeout_minutes || ' minutes')::interval
  WHERE id IN (
    SELECT id
    FROM public.jobs
    WHERE 
      -- Either it's pending and ready to run
      (status = 'pending' AND run_at <= timezone('utc'::text, now()))
      OR 
      -- Or it's stuck running past its lock timeout (worker died)
      (status = 'running' AND locked_until <= timezone('utc'::text, now()))
    ORDER BY priority DESC, run_at ASC
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Reapply permissions
REVOKE ALL ON FUNCTION public.claim_jobs(INT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_jobs(INT, INT) FROM anon;
REVOKE ALL ON FUNCTION public.claim_jobs(INT, INT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_jobs(INT, INT) TO service_role;

-- 3. Create automation_executions table
CREATE TABLE IF NOT EXISTS public.automation_executions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_id UUID REFERENCES public.workflow_state(id) ON DELETE SET NULL, -- Can be null if it's a simple one-off job
  trigger_event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  worker TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  input_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_snapshot JSONB DEFAULT NULL,
  cost NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.automation_executions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users cannot directly access automation executions" ON public.automation_executions FOR ALL USING (false);

CREATE INDEX idx_automation_executions_worker ON public.automation_executions(worker);
CREATE INDEX idx_automation_executions_status ON public.automation_executions(status);
CREATE INDEX idx_automation_executions_started_at ON public.automation_executions(started_at);

NOTIFY pgrst, 'reload schema';
