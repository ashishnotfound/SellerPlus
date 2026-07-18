-- PostgreSQL Migration: 20260713_create_logs_and_telemetry.sql
-- Description: Sets up centralized system logging, telemetry metrics, and expanded heartbeat tracking

-- 1. Create system_logs table
DROP TABLE IF EXISTS public.system_logs;
CREATE TABLE IF NOT EXISTS public.system_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  level text NOT NULL CHECK (level IN ('TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL')),
  message text NOT NULL,
  correlation_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index on created_at for fast time-range querying and pruning
CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON public.system_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_system_logs_correlation_id ON public.system_logs(correlation_id);

-- Enable RLS
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

-- Read policies: Authenticated users can view logs
DROP POLICY IF EXISTS "Allow read system_logs to authenticated users" ON public.system_logs;
CREATE POLICY "Allow read system_logs to authenticated users" ON public.system_logs
  FOR SELECT USING (auth.role() = 'authenticated');

-- Write policies: System/service roles can insert
DROP POLICY IF EXISTS "System can manage system_logs" ON public.system_logs;
CREATE POLICY "System can manage system_logs" ON public.system_logs
  FOR ALL USING (true);

-- 2. Create ai_telemetry_metrics table
CREATE TABLE IF NOT EXISTS public.ai_telemetry_metrics (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider_model text NOT NULL,
  request_count integer DEFAULT 1 NOT NULL,
  cache_hits integer DEFAULT 0 NOT NULL,
  cache_misses integer DEFAULT 0 NOT NULL,
  total_latency_ms bigint DEFAULT 0 NOT NULL,
  tokens_used integer DEFAULT 0 NOT NULL,
  estimated_cost numeric DEFAULT 0.0 NOT NULL,
  estimated_savings numeric DEFAULT 0.0 NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for time-series charts
CREATE INDEX IF NOT EXISTS idx_ai_telemetry_metrics_created_at ON public.ai_telemetry_metrics(created_at);

-- Enable RLS
ALTER TABLE public.ai_telemetry_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read telemetry to authenticated users" ON public.ai_telemetry_metrics;
CREATE POLICY "Allow read telemetry to authenticated users" ON public.ai_telemetry_metrics
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "System can manage telemetry" ON public.ai_telemetry_metrics;
CREATE POLICY "System can manage telemetry" ON public.ai_telemetry_metrics
  FOR ALL USING (true);

-- 3. Create heartbeats table (or update if already exists)
CREATE TABLE IF NOT EXISTS public.heartbeats (
  worker_name text PRIMARY KEY,
  last_run_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  last_success_at timestamp with time zone,
  last_failure_at timestamp with time zone,
  consecutive_failures integer DEFAULT 0 NOT NULL,
  avg_duration_ms integer DEFAULT 0 NOT NULL,
  max_duration_ms integer DEFAULT 0 NOT NULL,
  recovery_time_ms integer DEFAULT 0 NOT NULL,
  health_status text DEFAULT 'healthy' NOT NULL CHECK (health_status IN ('healthy', 'unhealthy', 'degraded')),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.heartbeats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read heartbeats to authenticated users" ON public.heartbeats;
CREATE POLICY "Allow read heartbeats to authenticated users" ON public.heartbeats
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "System can manage heartbeats" ON public.heartbeats;
CREATE POLICY "System can manage heartbeats" ON public.heartbeats
  FOR ALL USING (true);
