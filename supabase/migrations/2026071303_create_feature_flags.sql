-- PostgreSQL Migration: 20260713_create_feature_flags.sql
-- Description: Centralized Feature Flags and Overrides for experimental rollouts

-- 1. Create feature_flags table (drop old version if it exists from full_schema)
DROP TABLE IF EXISTS public.feature_flag_overrides;
DROP TABLE IF EXISTS public.feature_flags;
CREATE TABLE IF NOT EXISTS public.feature_flags (
  key text PRIMARY KEY,
  description text,
  is_enabled boolean DEFAULT false NOT NULL,
  env_defaults jsonb DEFAULT '{}'::jsonb NOT NULL,
  dependencies text[] DEFAULT '{}'::text[] NOT NULL,
  rules jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on feature_flags
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

-- 2. Create feature_flag_overrides table
CREATE TABLE IF NOT EXISTS public.feature_flag_overrides (
  flag_key text REFERENCES public.feature_flags(key) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  PRIMARY KEY (flag_key, user_id)
);

-- Enable RLS on overrides
ALTER TABLE public.feature_flag_overrides ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies
-- Drop existing policies first to ensure idempotency on re-run
DROP POLICY IF EXISTS "Allow read feature_flags to all authenticated users" ON public.feature_flags;
DROP POLICY IF EXISTS "Allow read feature_flag_overrides to owners" ON public.feature_flag_overrides;
DROP POLICY IF EXISTS "Superadmins can manage feature_flags" ON public.feature_flags;
DROP POLICY IF EXISTS "Superadmins can manage feature_flag_overrides" ON public.feature_flag_overrides;

-- Create policies
CREATE POLICY "Allow read feature_flags to all authenticated users" ON public.feature_flags
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow read feature_flag_overrides to owners" ON public.feature_flag_overrides
  FOR SELECT USING (auth.role() = 'authenticated' AND auth.uid() = user_id);

-- Only super_admins can insert/update/delete feature_flags or overrides
-- We check profiles.is_super_admin to determine admin privileges
CREATE POLICY "Superadmins can manage feature_flags" ON public.feature_flags
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_super_admin = true
    )
  );

CREATE POLICY "Superadmins can manage feature_flag_overrides" ON public.feature_flag_overrides
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_super_admin = true
    )
  );

-- 4. Default Seed Data for Phase 3
INSERT INTO public.feature_flags (key, description, is_enabled, env_defaults, dependencies, rules)
VALUES 
  ('ai_gateway', 'Enables centralized multi-LLM routing gateway', true, '{"development": true, "staging": true, "production": true}'::jsonb, '{}'::text[], '{}'::jsonb),
  ('ai_cache', 'Enables persistent caching of AI prompt responses', true, '{"development": true, "staging": true, "production": true}'::jsonb, '{"ai_gateway"}'::text[], '{}'::jsonb),
  ('deepseek_provider', 'Enables routing to DeepSeek models', true, '{"development": true, "staging": false, "production": false}'::jsonb, '{"ai_gateway"}'::text[], '{}'::jsonb),
  ('automation_rollbacks', 'Enables active rollback processing on dashboard', true, '{"development": true, "staging": true, "production": true}'::jsonb, '{}'::text[], '{}'::jsonb)
ON CONFLICT (key) DO UPDATE 
SET 
  description = EXCLUDED.description,
  is_enabled = EXCLUDED.is_enabled,
  env_defaults = EXCLUDED.env_defaults,
  dependencies = EXCLUDED.dependencies;
