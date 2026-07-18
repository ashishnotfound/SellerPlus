-- Phase 7: Background Job Queue for BI Engine
-- A lightweight Postgres-backed job queue. Zero external dependencies.
-- The BI Engine enqueues work here; a cron-worker processes it async.

CREATE TABLE IF NOT EXISTS public.bi_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL DEFAULT 'bi_analysis',
  payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued' 
    CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  result JSONB DEFAULT NULL,
  error TEXT DEFAULT NULL,
  priority INT NOT NULL DEFAULT 5, -- Lower number = higher priority
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NULL,
  completed_at TIMESTAMPTZ DEFAULT NULL
);

-- Enable RLS
ALTER TABLE public.bi_jobs ENABLE ROW LEVEL SECURITY;

-- Users can only see their own jobs
CREATE POLICY "Users can view their own BI jobs"
  ON public.bi_jobs FOR SELECT
  USING (auth.uid() = user_id);

-- Service role manages all jobs (workers use admin client)
CREATE POLICY "Service role manages all BI jobs"
  ON public.bi_jobs FOR ALL
  USING (true);

-- Index: Worker polling — queued jobs ordered by priority + age
CREATE INDEX idx_bi_jobs_status_priority 
  ON public.bi_jobs(status, priority ASC, created_at ASC)
  WHERE status = 'queued';

-- Index: User-facing job status lookup
CREATE INDEX idx_bi_jobs_user_created 
  ON public.bi_jobs(user_id, created_at DESC);

NOTIFY pgrst, 'reload schema';
