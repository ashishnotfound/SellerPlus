-- Migration: Ads, Refunds, and Listing Alerts Schema
-- Installs advertising_campaigns, refunds, and listing_alerts tables with RLS and Super-admin access

-- 1. Create Advertising Campaigns table
CREATE TABLE IF NOT EXISTS public.advertising_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  campaign_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  budget NUMERIC(10,2) NOT NULL,
  bid_strategy TEXT DEFAULT 'dynamic',
  impressions INT DEFAULT 0,
  clicks INT DEFAULT 0,
  spend NUMERIC(10,2) DEFAULT 0,
  sales NUMERIC(10,2) DEFAULT 0,
  orders INT DEFAULT 0,
  clicks_through_rate NUMERIC(5,4) DEFAULT 0,
  cost_per_click NUMERIC(10,2) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(user_id, campaign_id)
);

-- 2. Create Refunds table
CREATE TABLE IF NOT EXISTS public.refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  refund_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  asin TEXT NOT NULL,
  quantity INT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT DEFAULT 'INR' NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'Processed',
  processed_at TIMESTAMPTZ NOT NULL,
  marketplace TEXT DEFAULT 'IN',
  UNIQUE(user_id, refund_id, sku)
);

-- 3. Create Listing Alerts table
CREATE TABLE IF NOT EXISTS public.listing_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  sku TEXT NOT NULL,
  asin TEXT NOT NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('SUPPRESSED', 'INACTIVE', 'PRICING_ERROR', 'MISSING_IMAGE', 'POLICY_WARNING', 'NEGATIVE_PROFIT', 'LOW_STOCK', 'OUT_OF_STOCK')),
  severity TEXT NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
  reason TEXT NOT NULL,
  recommended_action TEXT NOT NULL,
  resolved BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.advertising_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_alerts ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for Advertising Campaigns
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='advertising_campaigns' AND policyname='Users own ad campaigns') THEN
    CREATE POLICY "Users own ad campaigns" ON public.advertising_campaigns FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='advertising_campaigns' AND policyname='Super-admins can view all campaigns') THEN
    CREATE POLICY "Super-admins can view all campaigns" ON public.advertising_campaigns FOR SELECT USING (public.is_super_admin(auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='advertising_campaigns' AND policyname='Allow anonymous local testing for campaigns') THEN
    CREATE POLICY "Allow anonymous local testing for campaigns" ON public.advertising_campaigns FOR ALL USING (auth.role() = 'anon') WITH CHECK (auth.role() = 'anon');
  END IF;
END $$;

-- 5. RLS Policies for Refunds
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='refunds' AND policyname='Users own refunds') THEN
    CREATE POLICY "Users own refunds" ON public.refunds FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='refunds' AND policyname='Super-admins can view all refunds') THEN
    CREATE POLICY "Super-admins can view all refunds" ON public.refunds FOR SELECT USING (public.is_super_admin(auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='refunds' AND policyname='Allow anonymous local testing for refunds') THEN
    CREATE POLICY "Allow anonymous local testing for refunds" ON public.refunds FOR ALL USING (auth.role() = 'anon') WITH CHECK (auth.role() = 'anon');
  END IF;
END $$;

-- 6. RLS Policies for Listing Alerts
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='listing_alerts' AND policyname='Users own listing alerts') THEN
    CREATE POLICY "Users own listing alerts" ON public.listing_alerts FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='listing_alerts' AND policyname='Super-admins can view all listing alerts') THEN
    CREATE POLICY "Super-admins can view all listing alerts" ON public.listing_alerts FOR SELECT USING (public.is_super_admin(auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='listing_alerts' AND policyname='Allow anonymous local testing for listing alerts') THEN
    CREATE POLICY "Allow anonymous local testing for listing alerts" ON public.listing_alerts FOR ALL USING (auth.role() = 'anon') WITH CHECK (auth.role() = 'anon');
  END IF;
END $$;

-- Trigger update checks for postgrest reload
NOTIFY pgrst, 'reload schema';
