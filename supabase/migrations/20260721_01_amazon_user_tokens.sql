-- Migration: Amazon User Tokens table
-- Stores OAuth access & refresh tokens per user per Amazon API provider.

CREATE TABLE IF NOT EXISTS public.amazon_user_tokens (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supabase_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider          TEXT NOT NULL CHECK (provider IN ('sp', 'ads')),
  access_token      TEXT NOT NULL,
  refresh_token     TEXT NOT NULL,
  expires_at        TIMESTAMPTZ NOT NULL,
  scope             TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),
  -- Prevent duplicate entries per user/provider combo
  UNIQUE (supabase_user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_amazon_tokens_user_id
  ON public.amazon_user_tokens (supabase_user_id);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS amazon_tokens_updated_at ON public.amazon_user_tokens;
CREATE TRIGGER amazon_tokens_updated_at
  BEFORE UPDATE ON public.amazon_user_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Row Level Security
ALTER TABLE public.amazon_user_tokens ENABLE ROW LEVEL SECURITY;

-- Users can only read their own tokens
CREATE POLICY "Users can view own amazon tokens"
  ON public.amazon_user_tokens FOR SELECT
  USING (auth.uid() = supabase_user_id);

-- Users can delete their own tokens (disconnect)
CREATE POLICY "Users can delete own amazon tokens"
  ON public.amazon_user_tokens FOR DELETE
  USING (auth.uid() = supabase_user_id);

-- Only the service role can insert/update (via Edge Function)
-- No INSERT/UPDATE policy for authenticated users; service_role bypasses RLS.
