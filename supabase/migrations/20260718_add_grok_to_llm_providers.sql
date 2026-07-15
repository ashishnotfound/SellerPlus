-- ===================================================================
-- SellerPlus OS — Native Grok / xAI Integration
-- Migration: 20260718_add_grok_to_llm_providers.sql
-- ===================================================================

-- Drop the old provider check constraint
ALTER TABLE public.llm_settings DROP CONSTRAINT IF EXISTS llm_settings_provider_check;

-- Add the updated constraint including 'grok' and 'xai'
ALTER TABLE public.llm_settings ADD CONSTRAINT llm_settings_provider_check CHECK (
  provider IN ('gemini', 'openai', 'anthropic', 'deepseek', 'openrouter', 'ollama', 'grok', 'xai')
);
