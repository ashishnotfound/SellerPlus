-- Migration: Amazon Developer Credentials table
-- Stores BYOK credentials for Amazon SP API and Amazon Ads API per user.

CREATE TABLE IF NOT EXISTS public.amazon_developer_credentials (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sp_client_id      TEXT,
  sp_client_secret  TEXT,
  ads_client_id     TEXT,
  ads_client_secret TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),
  -- One config per user
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_amazon_credentials_user_id
  ON public.amazon_developer_credentials (user_id);

-- Auto-update updated_at on row change
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_amazon_dev_creds') THEN
    CREATE TRIGGER set_updated_at_amazon_dev_creds
      BEFORE UPDATE ON public.amazon_developer_credentials
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- Enable Row-Level Security
ALTER TABLE public.amazon_developer_credentials ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='amazon_developer_credentials' AND policyname='Users can view own credentials'
  ) THEN
    CREATE POLICY "Users can view own credentials" ON public.amazon_developer_credentials
      FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='amazon_developer_credentials' AND policyname='Users can insert own credentials'
  ) THEN
    CREATE POLICY "Users can insert own credentials" ON public.amazon_developer_credentials
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='amazon_developer_credentials' AND policyname='Users can update own credentials'
  ) THEN
    CREATE POLICY "Users can update own credentials" ON public.amazon_developer_credentials
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;
