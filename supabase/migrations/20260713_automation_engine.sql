-- SellerPlus OS — Automation Engine & Profit Leak Detection Schema
-- Migration: 20260713_automation_engine.sql

-- ═══════════════════════════════════════════════════
-- 1. Automation Logs — Full audit trail of every automation execution
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.automation_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  rule_id TEXT NOT NULL,
  rule_name TEXT NOT NULL,
  category TEXT NOT NULL,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'executed', 'rejected', 'failed', 'rolled_back')),
  confidence INT NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 100),
  description TEXT NOT NULL,
  estimated_impact TEXT,
  affected_entities TEXT[] DEFAULT '{}',
  action_taken TEXT,
  result_message TEXT,
  rollback_data JSONB DEFAULT NULL,
  executed_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.automation_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their automation logs" 
  ON public.automation_logs FOR SELECT 
  USING (auth.uid() = user_id);

CREATE INDEX idx_automation_logs_user_id ON public.automation_logs(user_id);
CREATE INDEX idx_automation_logs_status ON public.automation_logs(status);
CREATE INDEX idx_automation_logs_created_at ON public.automation_logs(created_at);

-- ═══════════════════════════════════════════════════
-- 2. Automation Preferences — Per-user rule enable/disable overrides
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.automation_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  rule_id TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  custom_threshold JSONB DEFAULT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(user_id, rule_id)
);

ALTER TABLE public.automation_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their automation preferences"
  ON public.automation_preferences FOR ALL
  USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════
-- 3. Enhanced alert_logs — Add severity, impact, and recommendation fields
-- ═══════════════════════════════════════════════════

-- Add columns if they don't exist (idempotent)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'alert_logs' AND column_name = 'severity') THEN
    ALTER TABLE public.alert_logs ADD COLUMN severity TEXT DEFAULT 'info';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'alert_logs' AND column_name = 'estimated_impact') THEN
    ALTER TABLE public.alert_logs ADD COLUMN estimated_impact NUMERIC(12, 2) DEFAULT NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'alert_logs' AND column_name = 'affected_sku') THEN
    ALTER TABLE public.alert_logs ADD COLUMN affected_sku TEXT DEFAULT NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'alert_logs' AND column_name = 'affected_campaign') THEN
    ALTER TABLE public.alert_logs ADD COLUMN affected_campaign TEXT DEFAULT NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'alert_logs' AND column_name = 'recommended_action') THEN
    ALTER TABLE public.alert_logs ADD COLUMN recommended_action TEXT DEFAULT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_alert_logs_severity ON public.alert_logs(severity);
CREATE INDEX IF NOT EXISTS idx_alert_logs_type ON public.alert_logs(type);
