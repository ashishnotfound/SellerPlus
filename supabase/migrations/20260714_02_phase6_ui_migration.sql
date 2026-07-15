-- 20260715_phase6_ui_migration.sql

ALTER TABLE public.ai_recommendation_history 
RENAME COLUMN confidence_score TO confidence;

ALTER TABLE public.ai_recommendation_history 
ADD COLUMN confidence_reason TEXT;

ALTER TABLE public.ai_recommendation_history 
ADD COLUMN source_kpis JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.ai_recommendation_history 
ADD COLUMN simulation JSONB;

ALTER TABLE public.ai_recommendation_history 
ADD COLUMN dependencies JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.ai_recommendation_history 
ADD COLUMN conflicts JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.ai_recommendation_history 
ADD COLUMN risk_level VARCHAR(50);

ALTER TABLE public.ai_recommendation_history 
ADD COLUMN estimated_time VARCHAR(255);

ALTER TABLE public.ai_recommendation_history 
ADD COLUMN lifecycle VARCHAR(50) NOT NULL DEFAULT 'Draft';

ALTER TABLE public.ai_recommendation_history 
ADD COLUMN action_type VARCHAR(255);

ALTER TABLE public.ai_recommendation_history 
ADD COLUMN action_payload JSONB;

-- Drop legacy columns safely
ALTER TABLE public.ai_recommendation_history DROP COLUMN IF EXISTS formula;
ALTER TABLE public.ai_recommendation_history DROP COLUMN IF EXISTS action_mapping;
ALTER TABLE public.ai_recommendation_history DROP COLUMN IF EXISTS is_deterministic;

-- Indexes for Automation Engine Polling and Realtime UI filtering
CREATE INDEX IF NOT EXISTS idx_ai_rec_history_lifecycle ON public.ai_recommendation_history(user_id, lifecycle);

-- Enable Realtime Broadcasting
ALTER TABLE public.ai_recommendation_history REPLICA IDENTITY FULL;
