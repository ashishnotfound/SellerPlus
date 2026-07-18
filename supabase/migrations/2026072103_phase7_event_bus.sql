-- Migration: 20260721_phase7_event_bus.sql
-- Purpose: Core tables for the Phase 7 Automation Backbone (Event Bus, Jobs, Workflows)

-- ═══════════════════════════════════════════════════
-- 1. Event Bus Ledger
-- ═══════════════════════════════════════════════════

DROP TABLE IF EXISTS public.events CASCADE;
CREATE TABLE IF NOT EXISTS public.events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE, -- Nullable for system-wide events
  event_type TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT 'v1',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  correlation_id TEXT NOT NULL,
  causation_id TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Note: Events are append-only.
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their events" 
  ON public.events FOR SELECT 
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_events_user_id ON public.events(user_id);
CREATE INDEX IF NOT EXISTS idx_events_event_type ON public.events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_correlation_id ON public.events(correlation_id);

-- ═══════════════════════════════════════════════════
-- 2. Job Queue (Postgres-backed via SKIP LOCKED)
-- ═══════════════════════════════════════════════════

DROP TABLE IF EXISTS public.jobs CASCADE;
CREATE TABLE IF NOT EXISTS public.jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  queue_name TEXT NOT NULL, -- e.g., 'ai_worker', 'sync_worker', 'notification_worker'
  idempotency_key TEXT UNIQUE, -- Nullable, but if provided prevents duplicate jobs
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority INT NOT NULL DEFAULT 10,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'delayed')),
  run_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  error_log JSONB DEFAULT '[]'::jsonb,
  completed_at TIMESTAMPTZ,
  correlation_id TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
-- Background workers run with service role, so they bypass RLS.
-- End-users generally do not read the jobs table directly.
CREATE POLICY "Users cannot directly access jobs" ON public.jobs FOR ALL USING (false);

-- Index for queue workers querying pending jobs efficiently
CREATE INDEX idx_jobs_pending_run_at ON public.jobs(queue_name, status, run_at) WHERE status = 'pending';
CREATE INDEX idx_jobs_idempotency ON public.jobs(idempotency_key);
CREATE INDEX idx_jobs_correlation_id ON public.jobs(correlation_id);

-- ═══════════════════════════════════════════════════
-- 3. Workflow Engine State
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.workflow_state (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  workflow_type TEXT NOT NULL,
  workflow_version TEXT NOT NULL DEFAULT 'v1',
  current_step TEXT NOT NULL,
  state_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'pending_approval', 'completed', 'failed', 'cancelled')),
  correlation_id TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.workflow_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their workflows" 
  ON public.workflow_state FOR SELECT 
  USING (auth.uid() = user_id);

CREATE INDEX idx_workflow_state_user_id ON public.workflow_state(user_id);
CREATE INDEX idx_workflow_state_status ON public.workflow_state(status);

-- ═══════════════════════════════════════════════════
-- 4. Approval Policies Engine
-- ═══════════════════════════════════════════════════

DROP TABLE IF EXISTS public.approval_policies CASCADE;
CREATE TABLE IF NOT EXISTS public.approval_policies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  action_type TEXT NOT NULL, -- e.g., 'increase_ad_budget', 'pause_campaign', 'delete_listing'
  policy TEXT NOT NULL DEFAULT 'require_approval' CHECK (policy IN ('allow_automatically', 'require_approval', 'never_without_explicit_approval')),
  auto_approve_threshold JSONB DEFAULT NULL, -- e.g., {"max_amount": 500}
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(user_id, action_type)
);

ALTER TABLE public.approval_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their approval policies" 
  ON public.approval_policies FOR ALL 
  USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════
-- 5. System Observability Metrics
-- ═══════════════════════════════════════════════════

DROP TABLE IF EXISTS public.system_metrics CASCADE;
CREATE TABLE IF NOT EXISTS public.system_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  metric_name TEXT NOT NULL,
  metric_value NUMERIC NOT NULL,
  tags JSONB DEFAULT '{}'::jsonb,
  recorded_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.system_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "System metrics are private" ON public.system_metrics FOR ALL USING (false);

CREATE INDEX idx_system_metrics_name_time ON public.system_metrics(metric_name, recorded_at);
