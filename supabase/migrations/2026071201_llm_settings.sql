-- Migration: Admin LLM/API Settings Schema
-- Creates llm_settings table for configuring Gemini, OpenAI, Claude, DeepSeek, OpenRouter, Ollama APIs

CREATE TABLE IF NOT EXISTS public.llm_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('gemini', 'openai', 'anthropic', 'deepseek', 'openrouter', 'ollama')),
  api_key TEXT,
  model_name TEXT NOT NULL,
  endpoint_url TEXT, -- for custom OpenAI-compatible or Ollama endpoints
  priority INT DEFAULT 1 NOT NULL,
  is_enabled BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE (user_id, provider)
);

-- Enable Row-Level Security
ALTER TABLE public.llm_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='llm_settings' AND policyname='Users own LLM settings'
  ) THEN
    CREATE POLICY "Users own LLM settings" ON public.llm_settings 
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='llm_settings' AND policyname='Allow anonymous local testing for LLM settings'
  ) THEN
    CREATE POLICY "Allow anonymous local testing for LLM settings" ON public.llm_settings 
      FOR ALL USING (auth.role() = 'anon') WITH CHECK (auth.role() = 'anon');
  END IF;
END $$;

-- Triggers for updated_at tracking
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER on_llm_settings_updated
  BEFORE UPDATE ON public.llm_settings
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
