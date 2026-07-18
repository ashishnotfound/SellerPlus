-- ===================================================================
-- SellerPlus OS — Final Stabilization
-- Migration: 20260719_amazon_connections.sql
--
-- Persists Amazon SP-API connection details in Supabase so users
-- don't lose their configuration on browser refresh, device change,
-- or cache clear. Credentials are stored server-side and never
-- exposed to the client beyond what the sync flow requires.
-- ===================================================================

-- ─── Amazon Connections Table ───────────────────────────────────────
DROP TABLE IF EXISTS public.amazon_connections CASCADE;
CREATE TABLE IF NOT EXISTS public.amazon_connections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Seller identification
  seller_id     TEXT NOT NULL,
  marketplace   TEXT NOT NULL DEFAULT 'India (amazon.in)',
  marketplace_id TEXT,               -- Amazon marketplace ID e.g. A21TJRUUN4KGV

  -- LWA OAuth credentials (stored server-side only)
  client_id      TEXT NOT NULL,
  client_secret  TEXT NOT NULL,
  refresh_token  TEXT NOT NULL,

  -- Sync state
  is_sandbox    BOOLEAN NOT NULL DEFAULT false,
  is_active     BOOLEAN NOT NULL DEFAULT true,

  -- Sync timestamps
  last_listings_sync  TIMESTAMPTZ,
  last_orders_sync    TIMESTAMPTZ,
  last_inventory_sync TIMESTAMPTZ,
  last_ads_sync       TIMESTAMPTZ,
  last_refunds_sync   TIMESTAMPTZ,

  -- Metadata
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one active connection per user
CREATE UNIQUE INDEX IF NOT EXISTS uq_amazon_connections_user
  ON public.amazon_connections (user_id)
  WHERE is_active = true;

-- ─── RLS Policies ──────────────────────────────────────────────────
ALTER TABLE public.amazon_connections ENABLE ROW LEVEL SECURITY;

-- Users can only see and manage their own connections
CREATE POLICY "Users manage their own Amazon connections"
  ON public.amazon_connections
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── Updated_at trigger ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_amazon_connections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_amazon_connections_updated_at ON public.amazon_connections;
CREATE TRIGGER trg_amazon_connections_updated_at
  BEFORE UPDATE ON public.amazon_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_amazon_connections_updated_at();

-- ─── Notify PostgREST ──────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
