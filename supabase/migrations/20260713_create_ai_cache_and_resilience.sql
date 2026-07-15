-- PostgreSQL Migration: 20260713_create_ai_cache_and_resilience.sql
-- Description: Creates persistent caching and resilience tracking schemas

-- 1. Create ai_response_cache table
CREATE TABLE IF NOT EXISTS public.ai_response_cache (
  cache_key text PRIMARY KEY,
  response_text text NOT NULL,
  tokens_used integer DEFAULT 0,
  estimated_cost numeric DEFAULT 0.0,
  latency_ms integer DEFAULT 0,
  is_negative boolean DEFAULT false NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for cache lookup pruning
CREATE INDEX IF NOT EXISTS idx_ai_response_cache_expires_at ON public.ai_response_cache(expires_at);

-- Enable RLS
ALTER TABLE public.ai_response_cache ENABLE ROW LEVEL SECURITY;

-- Read permission to all authenticated users
DROP POLICY IF EXISTS "Allow read cache to authenticated users" ON public.ai_response_cache;
CREATE POLICY "Allow read cache to authenticated users" ON public.ai_response_cache
  FOR SELECT USING (auth.role() = 'authenticated');

-- Manage permission to superadmins/system
DROP POLICY IF EXISTS "System can manage cache" ON public.ai_response_cache;
CREATE POLICY "System can manage cache" ON public.ai_response_cache
  FOR ALL USING (true); -- Server-side service role client will bypass, but allow broad writes for auth users too since AI requests are executed in user sessions

-- 2. Create ai_resilience_states table for 3-state circuit breakers
CREATE TABLE IF NOT EXISTS public.ai_resilience_states (
  provider_model text PRIMARY KEY,
  state text DEFAULT 'closed' NOT NULL CHECK (state IN ('closed', 'open', 'half-open')),
  failure_count integer DEFAULT 0 NOT NULL,
  tripped_at timestamp with time zone,
  last_request_at timestamp with time zone,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.ai_resilience_states ENABLE ROW LEVEL SECURITY;

-- Allow authenticated read
DROP POLICY IF EXISTS "Allow read resilience status to authenticated" ON public.ai_resilience_states;
CREATE POLICY "Allow read resilience status to authenticated" ON public.ai_resilience_states
  FOR SELECT USING (auth.role() = 'authenticated');

-- Allow all writes for system execution
DROP POLICY IF EXISTS "System can manage resilience states" ON public.ai_resilience_states;
CREATE POLICY "System can manage resilience states" ON public.ai_resilience_states
  FOR ALL USING (true);
