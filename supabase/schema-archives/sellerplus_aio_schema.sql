-- =============================================================================
-- SellerPlus — All-In-One (AIO) Production Schema
-- Generated: 2026-07-18
-- Run this file against a clean Supabase PostgreSQL instance to bootstrap
-- the entire SellerPlus database in one shot.
--
-- Sections:
--   0.  Extensions & Utilities
--   1.  Core Identity  (profiles, workspaces, members, subscriptions, payments)
--   2.  Product Catalog (products, variants, master_skus, cost_configs)
--   3.  Listings        (listings, listing_versions, keywords, keyword_rankings, competitors)
--   4.  Orders & Logistics (orders, order_items, shipments, returns)
--   5.  Inventory       (warehouses, inventory, inventory_planner)
--   6.  Analytics       (seller_financial_metrics, product_analytics, ad_performance_logs)
--   7.  Advertising     (ads, ad_groups, ad_campaigns, refunds)
--   8.  Goals & Automation (goals, goal_snapshots, automation_engine, workflow_state)
--   9.  AI Layer        (ai_generations, ai_usage_logs, ai_memory, ai_schedules,
--                        ai_knowledge_articles, ai_cache, feature_flags)
--  10.  Communications  (alerts, alert_logs, notifications, notification_settings)
--  11.  Amazon Connect  (amazon_connections, amazon_user_tokens)
--  12.  LLM Settings    (llm_settings)
--  13.  Platform Ops    (jobs / unified queue, events, automation_executions,
--                        logs, system_metrics, exec_sql, admin_audit_logs)
--  14.  Warehouse Workers (warehouse_workers, worker_shifts, worker_tasks)
--  15.  Shared Triggers & Indexes
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. EXTENSIONS & UTILITIES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Generic updated_at trigger function (reused across tables)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CORE IDENTITY
-- ─────────────────────────────────────────────────────────────────────────────

-- 1a. Profiles (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id                UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email             TEXT NOT NULL UNIQUE,
  full_name         TEXT,
  avatar_url        TEXT,
  role              TEXT DEFAULT 'owner'
                    CHECK (role IN ('owner','admin','manager','analyst','employee','read-only')),
  is_super_admin    BOOLEAN DEFAULT false NOT NULL,
  merchant_name     TEXT,
  authorized_email  TEXT,
  updated_at        TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile"   ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- 1b. Workspaces
CREATE TABLE IF NOT EXISTS public.workspaces (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  owner_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan          TEXT DEFAULT 'free' CHECK (plan IN ('free','starter','pro','business','enterprise')),
  settings      JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
-- NOTE: The SELECT policy referencing workspace_members is added AFTER
-- workspace_members is created below to avoid a forward-reference error.
CREATE POLICY "Owners can manage workspace"
  ON public.workspaces FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- 1c. Workspace Members
CREATE TABLE IF NOT EXISTS public.workspace_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role          TEXT DEFAULT 'member' CHECK (role IN ('owner','admin','manager','analyst','employee','member','read-only')),
  invited_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  joined_at     TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE (workspace_id, user_id)
);

ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view workspace members"
  ON public.workspace_members FOR SELECT
  USING (user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND w.owner_id = auth.uid())
  );
CREATE POLICY "Owners can manage workspace members"
  ON public.workspace_members FOR ALL
  USING (EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND w.owner_id = auth.uid()));

-- Now safe to add the SELECT policy on workspaces that references workspace_members
CREATE POLICY "Workspace members can view workspace"
  ON public.workspaces FOR SELECT
  USING (
    owner_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = id AND wm.user_id = auth.uid()
    )
  );

-- 1d. Subscriptions
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status                    TEXT NOT NULL CHECK (status IN ('active','trialing','past_due','canceled','incomplete')),
  plan_type                 TEXT NOT NULL CHECK (plan_type IN ('free','weekly','pro','business')),
  current_period_start      TIMESTAMPTZ NOT NULL,
  current_period_end        TIMESTAMPTZ NOT NULL,
  cancel_at_period_end      BOOLEAN DEFAULT false NOT NULL,
  razorpay_subscription_id  TEXT,
  created_at                TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own subscription" ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);

-- 1e. Payments
CREATE TABLE IF NOT EXISTS public.payments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  order_id    TEXT NOT NULL,
  payment_id  TEXT,
  signature   TEXT,
  amount      NUMERIC(10,2) NOT NULL,
  currency    TEXT DEFAULT 'INR' NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('pending','captured','failed','refunded')),
  created_at  TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own payments" ON public.payments FOR SELECT USING (auth.uid() = user_id);

-- 1f. Approval Policies
CREATE TABLE IF NOT EXISTS public.approval_policies (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action_type       TEXT NOT NULL,
  requires_approval BOOLEAN DEFAULT true NOT NULL,
  approver_role     TEXT,
  created_at        TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.approval_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage approval policies" ON public.approval_policies FOR ALL USING (auth.uid() = user_id);

-- 1g. New-user bootstrap trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  new_workspace_id UUID;
BEGIN
  -- Profile
  INSERT INTO public.profiles (id, email, full_name, avatar_url, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
    'owner'
  );

  -- Free subscription
  INSERT INTO public.subscriptions (user_id, status, plan_type, current_period_start, current_period_end)
  VALUES (NEW.id, 'active', 'free', now(), now() + INTERVAL '30 days');

  -- Default workspace
  INSERT INTO public.workspaces (name, owner_id, plan)
  VALUES (COALESCE(NEW.raw_user_meta_data->>'full_name', 'My Workspace'), NEW.id, 'free')
  RETURNING id INTO new_workspace_id;

  -- Add owner as member
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (new_workspace_id, NEW.id, 'owner');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. PRODUCT CATALOG
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sku         TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  image_url   TEXT,
  created_at  TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE (user_id, sku)
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own products" ON public.products FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.variants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sku         TEXT NOT NULL,
  name        TEXT NOT NULL,
  price       NUMERIC(10,2) DEFAULT 0.00 NOT NULL,
  stock       INT DEFAULT 0 NOT NULL,
  attributes  JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE (product_id, sku)
);

ALTER TABLE public.variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own variants" ON public.variants FOR ALL
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.master_skus (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id         UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  channel            TEXT NOT NULL CHECK (channel IN ('amazon','flipkart','meesho','shopify')),
  channel_sku        TEXT NOT NULL,
  channel_product_id TEXT NOT NULL,
  created_at         TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.master_skus ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage master SKUs" ON public.master_skus FOR ALL
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.user_id = auth.uid()));

-- Cost Config (per SKU)
CREATE TABLE IF NOT EXISTS public.cost_configs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sku                 TEXT NOT NULL,
  product_name        TEXT,
  cogs                NUMERIC(10,4) DEFAULT 0 NOT NULL,
  packaging_cost      NUMERIC(10,4) DEFAULT 0 NOT NULL,
  shipping_cost       NUMERIC(10,4) DEFAULT 0 NOT NULL,
  amazon_referral_fee NUMERIC(10,4) DEFAULT 0 NOT NULL,
  fba_fee             NUMERIC(10,4) DEFAULT 0 NOT NULL,
  other_fees          NUMERIC(10,4) DEFAULT 0 NOT NULL,
  target_margin_pct   NUMERIC(5,2)  DEFAULT 30 NOT NULL,
  updated_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE (user_id, sku)
);

ALTER TABLE public.cost_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own cost configs" ON public.cost_configs FOR ALL USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. LISTINGS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.listings (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                       UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  master_sku_id                 UUID REFERENCES public.master_skus(id) ON DELETE CASCADE,
  channel                       TEXT NOT NULL CHECK (channel IN ('amazon','flipkart','meesho','shopify')),
  -- Identifiers
  asin                          TEXT,
  sku                           TEXT,
  fnsku                         TEXT,
  parent_asin                   TEXT,
  -- Content
  title                         TEXT NOT NULL,
  description                   TEXT,
  bullet_points                 TEXT[] DEFAULT '{}'::text[],
  aplus_content                 JSONB DEFAULT '{}'::jsonb,
  backend_keywords              TEXT[] DEFAULT '{}'::text[],
  search_terms                  TEXT[] DEFAULT '{}'::text[],
  subject_matter                TEXT,
  target_audience               TEXT,
  -- Branding
  brand                         TEXT,
  manufacturer                  TEXT,
  product_type                  TEXT,
  -- Images
  main_image                    TEXT,
  gallery_images                TEXT[] DEFAULT '{}'::text[],
  alt_images                    TEXT[] DEFAULT '{}'::text[],
  -- Physical
  color                         TEXT,
  size                          TEXT,
  material                      TEXT,
  dimensions                    TEXT,
  weight                        TEXT,
  package_info                  TEXT,
  country_of_origin             TEXT,
  -- Pricing
  price                         NUMERIC(10,2) NOT NULL DEFAULT 0,
  sale_price                    NUMERIC(10,2),
  business_price                NUMERIC(10,2),
  -- Inventory
  available_qty                 INT DEFAULT 0,
  reserved_qty                  INT DEFAULT 0,
  incoming_qty                  INT DEFAULT 0,
  reorder_qty                   INT DEFAULT 0,
  -- Fulfillment
  fulfillment_channel           TEXT DEFAULT 'FBA' CHECK (fulfillment_channel IN ('FBA','FBM')),
  shipping_settings             JSONB DEFAULT '{}'::jsonb,
  package_settings              JSONB DEFAULT '{}'::jsonb,
  -- Performance
  status                        TEXT NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active','inactive','suppressed','draft')),
  rating                        NUMERIC(3,2),
  reviews_count                 INT DEFAULT 0,
  performance_category          TEXT DEFAULT 'working',
  performance_custom_thresholds JSONB DEFAULT '{"min_sales_winner":20,"max_refund_dead":10}'::jsonb,
  price_history                 JSONB DEFAULT '[]'::jsonb,
  sales_30d                     INT DEFAULT 0,
  revenue_30d                   NUMERIC(12,2) DEFAULT 0.00,
  orders_30d                    INT DEFAULT 0,
  units_sold_30d                INT DEFAULT 0,
  conversion_rate_30d           NUMERIC(5,2) DEFAULT 0.00,
  seo_score                     INT DEFAULT 100,
  seo_keyword_analysis          JSONB DEFAULT '{}'::jsonb,
  -- Timestamps
  created_at                    TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own listings" ON public.listings FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.listing_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id      UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  bullet_points   TEXT[],
  keywords        TEXT[],
  score_overall   NUMERIC(3,1),
  score_seo       NUMERIC(3,1),
  score_conversion NUMERIC(3,1),
  score_image     NUMERIC(3,1),
  score_keyword   NUMERIC(3,1),
  suggestions     JSONB DEFAULT '[]'::jsonb,
  snapshot_data   JSONB DEFAULT '{}'::jsonb,
  change_summary  TEXT,
  user_action     TEXT DEFAULT 'Edit',
  version_number  INT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.listing_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage listing versions" ON public.listing_versions FOR ALL
  USING (EXISTS (SELECT 1 FROM public.listings l WHERE l.id = listing_id AND l.user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.keywords (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  keyword         TEXT NOT NULL,
  search_volume   INT,
  difficulty_score INT,
  created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE (user_id, keyword)
);

ALTER TABLE public.keywords ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage keywords" ON public.keywords FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.keyword_rankings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword_id  UUID NOT NULL REFERENCES public.keywords(id) ON DELETE CASCADE,
  listing_id  UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  rank        INT NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.keyword_rankings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view keyword rankings" ON public.keyword_rankings FOR ALL
  USING (EXISTS (SELECT 1 FROM public.keywords k WHERE k.id = keyword_id AND k.user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.competitors (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  competitor_name TEXT NOT NULL,
  asin_or_sku     TEXT NOT NULL,
  rating          NUMERIC(3,2),
  reviews_count   INT DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE (user_id, asin_or_sku)
);

ALTER TABLE public.competitors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage competitors" ON public.competitors FOR ALL USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. ORDERS & LOGISTICS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.orders (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel                    TEXT NOT NULL CHECK (channel IN ('amazon','flipkart','meesho','shopify')),
  channel_order_id           TEXT NOT NULL,
  -- Status accepts Amazon native statuses too
  status                     TEXT NOT NULL DEFAULT 'pending',
  total_amount               NUMERIC(10,2) NOT NULL,
  currency                   TEXT DEFAULT 'INR' NOT NULL,
  customer_name              TEXT,
  shipping_address           JSONB,
  -- Amazon-specific fields
  purchase_date              TIMESTAMPTZ,
  last_update_date           TIMESTAMPTZ,
  fulfillment_channel        TEXT,
  marketplace_id             TEXT,
  number_of_items_shipped    INT DEFAULT 0,
  number_of_items_unshipped  INT DEFAULT 0,
  -- Profit tracking
  cost_of_goods              NUMERIC(10,2) DEFAULT 0.00,
  amazon_fees                NUMERIC(10,2) DEFAULT 0.00,
  shipping_cost              NUMERIC(10,2) DEFAULT 0.00,
  ad_cost                    NUMERIC(10,2) DEFAULT 0.00,
  net_profit                 NUMERIC(10,2) DEFAULT 0.00,
  created_at                 TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own orders" ON public.orders FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.order_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  listing_id    UUID REFERENCES public.listings(id) ON DELETE SET NULL,
  seller_sku    TEXT,
  asin          TEXT,
  title         TEXT,
  quantity      INT DEFAULT 1 NOT NULL,
  unit_price    NUMERIC(10,2) NOT NULL,
  condition     TEXT,
  created_at    TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own order items" ON public.order_items FOR ALL
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.shipments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  carrier         TEXT NOT NULL,
  tracking_number TEXT,
  status          TEXT NOT NULL,
  label_url       TEXT,
  awb_code        TEXT,
  created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view shipments" ON public.shipments FOR ALL
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.returns (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  channel_return_id TEXT,
  status           TEXT NOT NULL,
  reason           TEXT,
  created_at       TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view returns" ON public.returns FOR ALL
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = auth.uid()));


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. INVENTORY
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.warehouses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('self','fba','3pl')),
  address     TEXT,
  created_at  TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage warehouses" ON public.warehouses FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.inventory (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id    UUID NOT NULL REFERENCES public.variants(id) ON DELETE CASCADE,
  warehouse_id  UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  quantity      INT DEFAULT 0 NOT NULL,
  safety_stock  INT DEFAULT 10 NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage inventory" ON public.inventory FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.variants v
    JOIN public.products p ON p.id = v.product_id
    WHERE v.id = variant_id AND p.user_id = auth.uid()
  ));

CREATE TABLE IF NOT EXISTS public.inventory_planner (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sku                  TEXT NOT NULL,
  name                 TEXT NOT NULL,
  current_stock        INT DEFAULT 0 NOT NULL,
  incoming_stock       INT DEFAULT 0 NOT NULL,
  daily_velocity       NUMERIC(6,2) DEFAULT 0.00 NOT NULL,
  days_until_stockout  INT,
  reorder_point        INT DEFAULT 30 NOT NULL,
  reorder_qty          INT DEFAULT 100 NOT NULL,
  last_reorder_date    DATE,
  warehouse            TEXT DEFAULT 'FBA',
  created_at           TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE (user_id, sku)
);

ALTER TABLE public.inventory_planner ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage inventory planner" ON public.inventory_planner FOR ALL USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. ANALYTICS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.seller_financial_metrics (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date           DATE NOT NULL,
  revenue        NUMERIC(12,2) DEFAULT 0.00 NOT NULL,
  orders_count   INT DEFAULT 0 NOT NULL,
  units_sold     INT DEFAULT 0 NOT NULL,
  cogs           NUMERIC(12,2) DEFAULT 0.00 NOT NULL,
  shipping_cost  NUMERIC(12,2) DEFAULT 0.00 NOT NULL,
  amazon_fees    NUMERIC(12,2) DEFAULT 0.00 NOT NULL,
  ad_spend       NUMERIC(12,2) DEFAULT 0.00 NOT NULL,
  ad_sales       NUMERIC(12,2) DEFAULT 0.00 NOT NULL,
  refund_costs   NUMERIC(12,2) DEFAULT 0.00 NOT NULL,
  refund_count   INT DEFAULT 0 NOT NULL,
  net_profit     NUMERIC(12,2) DEFAULT 0.00 NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE (user_id, date)
);

ALTER TABLE public.seller_financial_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage financial metrics" ON public.seller_financial_metrics FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.product_analytics (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sku           TEXT NOT NULL,
  asin          TEXT,
  name          TEXT NOT NULL,
  revenue       NUMERIC(12,2) DEFAULT 0.00 NOT NULL,
  units_sold    INT DEFAULT 0 NOT NULL,
  cogs          NUMERIC(12,2) DEFAULT 0.00 NOT NULL,
  amazon_fees   NUMERIC(12,2) DEFAULT 0.00 NOT NULL,
  net_profit    NUMERIC(12,2) DEFAULT 0.00 NOT NULL,
  refund_count  INT DEFAULT 0 NOT NULL,
  refund_rate   NUMERIC(5,2) DEFAULT 0.00 NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE (user_id, sku)
);

ALTER TABLE public.product_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage product analytics" ON public.product_analytics FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.ad_performance_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date          DATE NOT NULL,
  campaign_name TEXT NOT NULL,
  spend         NUMERIC(10,2) DEFAULT 0.00 NOT NULL,
  sales         NUMERIC(12,2) DEFAULT 0.00 NOT NULL,
  impressions   INT DEFAULT 0 NOT NULL,
  clicks        INT DEFAULT 0 NOT NULL,
  conversions   INT DEFAULT 0 NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.ad_performance_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage ad performance logs" ON public.ad_performance_logs FOR ALL USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. ADVERTISING & REFUNDS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  campaign_id   TEXT,
  campaign_name TEXT NOT NULL,
  ad_group_name TEXT,
  keyword       TEXT,
  match_type    TEXT CHECK (match_type IN ('broad','phrase','exact','auto')),
  spend         NUMERIC(10,2) DEFAULT 0.00,
  sales         NUMERIC(12,2) DEFAULT 0.00,
  impressions   INT DEFAULT 0,
  clicks        INT DEFAULT 0,
  acos          NUMERIC(5,2) DEFAULT 0.00,
  roas          NUMERIC(5,2) DEFAULT 0.00,
  date          DATE,
  created_at    TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.ads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage ads" ON public.ads FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.refunds (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  order_id        UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  channel_ref_id  TEXT,
  sku             TEXT,
  asin            TEXT,
  reason          TEXT,
  amount          NUMERIC(10,2) DEFAULT 0.00,
  status          TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','processed')),
  date            DATE,
  created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage refunds" ON public.refunds FOR ALL USING (auth.uid() = user_id);

-- Expenses
CREATE TABLE IF NOT EXISTS public.expenses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  amount      NUMERIC(10,2) NOT NULL,
  date        DATE NOT NULL,
  category    TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage expenses" ON public.expenses FOR ALL USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. GOALS & AUTOMATION
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.goals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  workspace_id    UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  goal_type       TEXT NOT NULL,
  metric          TEXT NOT NULL,
  target_value    NUMERIC(12,2) NOT NULL,
  current_value   NUMERIC(12,2) DEFAULT 0,
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  status          TEXT DEFAULT 'active' CHECK (status IN ('active','completed','failed','paused')),
  priority        TEXT DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  ai_suggestion   TEXT,
  insight_data    JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own goals" ON public.goals FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.goal_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id       UUID NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  value         NUMERIC(12,2) NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.goal_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage goal snapshots" ON public.goal_snapshots FOR ALL
  USING (EXISTS (SELECT 1 FROM public.goals g WHERE g.id = goal_id AND g.user_id = auth.uid()));

-- Automation Rules
CREATE TABLE IF NOT EXISTS public.automation_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  workspace_id  UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  trigger_type  TEXT NOT NULL,
  trigger_config JSONB DEFAULT '{}'::jsonb,
  action_type   TEXT NOT NULL,
  action_config JSONB DEFAULT '{}'::jsonb,
  is_active     BOOLEAN DEFAULT true,
  last_run_at   TIMESTAMPTZ,
  run_count     INT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage automation rules" ON public.automation_rules FOR ALL USING (auth.uid() = user_id);

-- Workflow State
CREATE TABLE IF NOT EXISTS public.workflow_state (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id       UUID REFERENCES public.automation_rules(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status        TEXT NOT NULL CHECK (status IN ('pending','running','completed','failed','paused')),
  current_step  INT DEFAULT 0,
  state_data    JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.workflow_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage workflow state" ON public.workflow_state FOR ALL USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 9. AI LAYER
-- ─────────────────────────────────────────────────────────────────────────────

-- AI Generations log
CREATE TABLE IF NOT EXISTS public.ai_generations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  generation_type  TEXT NOT NULL CHECK (generation_type IN ('judge','keyword','copywriter','assistant','bi_engine','health','risk')),
  input_tokens     INT,
  output_tokens    INT,
  created_at       TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.ai_generations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own AI generations" ON public.ai_generations FOR SELECT USING (auth.uid() = user_id);

-- AI Usage Logs (detailed cost tracking)
CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider             TEXT NOT NULL CHECK (provider IN ('xAI','Anthropic','OpenAI','Gemini')),
  model                TEXT NOT NULL,
  prompt_tokens        INT NOT NULL DEFAULT 0,
  completion_tokens    INT NOT NULL DEFAULT 0,
  total_tokens         INT NOT NULL DEFAULT 0,
  estimated_cost_usd   NUMERIC(10,6) NOT NULL DEFAULT 0,
  request_type         TEXT NOT NULL,
  created_at           TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own AI usage" ON public.ai_usage_logs FOR SELECT USING (auth.uid() = user_id);

-- AI Memory
CREATE TABLE IF NOT EXISTS public.ai_memory (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  workspace_id  UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  memory_type   TEXT NOT NULL CHECK (memory_type IN ('user_preference','business_context','product_knowledge','market_insight','historical_pattern')),
  content       TEXT NOT NULL,
  embedding     JSONB,
  importance    NUMERIC(3,2) DEFAULT 0.5,
  access_count  INT DEFAULT 0,
  last_accessed TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.ai_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage AI memory" ON public.ai_memory FOR ALL USING (auth.uid() = user_id);

-- AI Schedules
CREATE TABLE IF NOT EXISTS public.ai_schedules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  task_type     TEXT NOT NULL,
  cron_expr     TEXT,
  next_run      TIMESTAMPTZ,
  last_run      TIMESTAMPTZ,
  status        TEXT DEFAULT 'active' CHECK (status IN ('active','paused','disabled')),
  config        JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.ai_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage AI schedules" ON public.ai_schedules FOR ALL USING (auth.uid() = user_id);

-- AI Knowledge Center
CREATE TABLE IF NOT EXISTS public.ai_knowledge_articles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  content         TEXT NOT NULL,
  category        TEXT,
  tags            TEXT[] DEFAULT '{}'::text[],
  is_public       BOOLEAN DEFAULT false,
  view_count      INT DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.ai_knowledge_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage knowledge articles" ON public.ai_knowledge_articles FOR ALL USING (auth.uid() = user_id OR is_public = true);

-- AI Response Cache
CREATE TABLE IF NOT EXISTS public.ai_cache (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key     TEXT NOT NULL UNIQUE,
  response      JSONB NOT NULL,
  hit_count     INT DEFAULT 0,
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.ai_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "System only ai cache" ON public.ai_cache FOR ALL USING (false);

-- LLM Settings (per-user API keys)
CREATE TABLE IF NOT EXISTS public.llm_settings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL DEFAULT 'xAI' CHECK (provider IN ('xAI','OpenAI','Anthropic','Gemini','Grok')),
  model           TEXT,
  api_key_enc     TEXT,
  temperature     NUMERIC(3,2) DEFAULT 0.7,
  max_tokens      INT DEFAULT 4096,
  custom_system_prompt TEXT,
  created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.llm_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own LLM settings" ON public.llm_settings FOR ALL USING (auth.uid() = user_id);

-- Feature Flags
CREATE TABLE IF NOT EXISTS public.feature_flags (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_name     TEXT NOT NULL UNIQUE,
  is_enabled    BOOLEAN DEFAULT false NOT NULL,
  description   TEXT,
  rollout_pct   INT DEFAULT 100 CHECK (rollout_pct BETWEEN 0 AND 100),
  target_users  UUID[] DEFAULT '{}'::uuid[],
  created_at    TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Only service role can manage feature flags" ON public.feature_flags FOR ALL USING (false);


-- ─────────────────────────────────────────────────────────────────────────────
-- 10. COMMUNICATIONS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.alerts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,
  message       TEXT NOT NULL,
  severity      TEXT DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
  is_resolved   BOOLEAN DEFAULT false NOT NULL,
  resolved_at   TIMESTAMPTZ,
  metadata      JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own alerts" ON public.alerts FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.alert_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  alert_id      UUID REFERENCES public.alerts(id) ON DELETE SET NULL,
  channel       TEXT NOT NULL CHECK (channel IN ('email','discord','telegram','in_app','push')),
  status        TEXT NOT NULL CHECK (status IN ('sent','failed','pending')),
  error_message TEXT,
  sent_at       TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.alert_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own alert logs" ON public.alert_logs FOR SELECT USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel     TEXT NOT NULL CHECK (channel IN ('email','push','whatsapp','in-app')),
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  is_read     BOOLEAN DEFAULT false,
  sent_at     TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.notification_settings (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  email_destination         TEXT,
  discord_webhook_url       TEXT,
  telegram_bot_token        TEXT,
  telegram_chat_id          TEXT,
  enable_low_stock_alerts   BOOLEAN DEFAULT true,
  enable_daily_summaries    BOOLEAN DEFAULT true,
  created_at                TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at                TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own notification settings" ON public.notification_settings FOR ALL USING (auth.uid() = user_id);

-- Support Tickets
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('open','in_progress','resolved','closed')),
  created_at  TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage support tickets" ON public.support_tickets FOR ALL USING (auth.uid() = user_id);

-- API Keys
CREATE TABLE IF NOT EXISTS public.api_keys (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  key_hash    TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  permissions TEXT[] DEFAULT '{}'::text[],
  created_at  TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own API keys" ON public.api_keys FOR ALL USING (auth.uid() = user_id);

-- Audit Logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,
  details     JSONB,
  created_at  TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own audit logs" ON public.audit_logs FOR SELECT USING (auth.uid() = user_id);

-- Activities feed
CREATE TABLE IF NOT EXISTS public.activities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  activity_type   TEXT NOT NULL,
  message         TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own activities" ON public.activities FOR SELECT USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 11. AMAZON CONNECTIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- Generic Amazon SP/Ads marketplace connections (stored credentials + metadata)
CREATE TABLE IF NOT EXISTS public.amazon_connections (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  marketplace_id    TEXT NOT NULL,
  marketplace_name  TEXT,
  seller_id         TEXT,
  connection_type   TEXT NOT NULL CHECK (connection_type IN ('sp_api','ads_api')),
  status            TEXT DEFAULT 'active' CHECK (status IN ('active','revoked','expired')),
  scopes            TEXT[] DEFAULT '{}'::text[],
  connected_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  last_synced_at    TIMESTAMPTZ,
  UNIQUE (user_id, marketplace_id, connection_type)
);

ALTER TABLE public.amazon_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own Amazon connections" ON public.amazon_connections FOR ALL USING (auth.uid() = user_id);

-- Per-user OAuth tokens (access + refresh) for SP and Ads APIs
CREATE TABLE IF NOT EXISTS public.amazon_user_tokens (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supabase_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider          TEXT NOT NULL CHECK (provider IN ('sp','ads')),
  access_token      TEXT NOT NULL,
  refresh_token     TEXT NOT NULL,
  expires_at        TIMESTAMPTZ NOT NULL,
  scope             TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE (supabase_user_id, provider)
);

ALTER TABLE public.amazon_user_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own amazon tokens"   ON public.amazon_user_tokens FOR SELECT USING (auth.uid() = supabase_user_id);
CREATE POLICY "Users can delete own amazon tokens" ON public.amazon_user_tokens FOR DELETE USING (auth.uid() = supabase_user_id);
-- INSERT/UPDATE only via service_role (Edge Functions)

DROP TRIGGER IF EXISTS amazon_tokens_updated_at ON public.amazon_user_tokens;
CREATE TRIGGER amazon_tokens_updated_at
  BEFORE UPDATE ON public.amazon_user_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ─────────────────────────────────────────────────────────────────────────────
-- 12. PLATFORM OPS — JOB QUEUE, EVENTS, LOGS
-- ─────────────────────────────────────────────────────────────────────────────

-- Unified Job Queue
CREATE TABLE IF NOT EXISTS public.jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type      TEXT NOT NULL,
  user_id       UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  workspace_id  UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','running','completed','failed','cancelled')),
  priority      INT DEFAULT 5,
  attempts      INT DEFAULT 0,
  max_attempts  INT DEFAULT 3,
  run_at        TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  locked_until  TIMESTAMPTZ,
  error         TEXT,
  result        JSONB DEFAULT NULL,
  schedule_id   TEXT,
  created_at    TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Only service role can access jobs" ON public.jobs FOR ALL USING (false);

-- claim_jobs RPC (used by background workers)
CREATE OR REPLACE FUNCTION public.claim_jobs(batch_size INT)
RETURNS SETOF public.jobs LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  UPDATE public.jobs
  SET status = 'running', updated_at = timezone('utc'::text, now())
  WHERE id IN (
    SELECT id FROM public.jobs
    WHERE status = 'pending' AND run_at <= timezone('utc'::text, now())
    ORDER BY priority ASC, run_at ASC
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_jobs(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_jobs(INT) TO service_role;

-- Event Bus
CREATE TABLE IF NOT EXISTS public.events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type    TEXT NOT NULL,
  source        TEXT,
  user_id       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  workspace_id  UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed     BOOLEAN DEFAULT false,
  processed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Only service role can access events" ON public.events FOR ALL USING (false);

-- Automation Executions
CREATE TABLE IF NOT EXISTS public.automation_executions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id       UUID REFERENCES public.workflow_state(id) ON DELETE SET NULL,
  trigger_event_id  UUID REFERENCES public.events(id) ON DELETE SET NULL,
  worker            TEXT NOT NULL,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  completed_at      TIMESTAMPTZ,
  status            TEXT NOT NULL CHECK (status IN ('running','completed','failed')),
  input_snapshot    JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_snapshot   JSONB DEFAULT NULL,
  cost              NUMERIC DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.automation_executions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No direct access to automation executions" ON public.automation_executions FOR ALL USING (false);

-- System Logs
CREATE TABLE IF NOT EXISTS public.system_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level       TEXT NOT NULL CHECK (level IN ('debug','info','warn','error','fatal')),
  message     TEXT NOT NULL,
  context     JSONB DEFAULT '{}'::jsonb,
  service     TEXT,
  user_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Only service role can view logs" ON public.system_logs FOR ALL USING (false);

-- System Metrics
CREATE TABLE IF NOT EXISTS public.system_metrics (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name   TEXT NOT NULL,
  metric_value  NUMERIC NOT NULL,
  tags          JSONB DEFAULT '{}'::jsonb,
  recorded_at   TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.system_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "System metrics are private" ON public.system_metrics FOR ALL USING (false);

-- Admin Audit Logs
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action          TEXT NOT NULL,
  entity          TEXT NOT NULL,
  admin_id        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  admin_email     TEXT,
  target_user_id  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  details         JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins can view admin audit logs" ON public.admin_audit_logs FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true));
CREATE POLICY "Super admins can insert admin audit logs" ON public.admin_audit_logs FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true));

-- exec_sql utility (for AI assistant dynamic queries — enforces RLS context)
CREATE OR REPLACE FUNCTION public.exec_sql(sql text, active_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', active_user_id::text, true);
  EXECUTE 'SELECT coalesce(json_agg(t)::jsonb, ''[]''::jsonb) FROM (' || sql || ') t' INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.exec_sql(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.exec_sql(text, uuid) TO service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 13. WAREHOUSE WORKERS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.warehouse_workers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  warehouse_id  UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  email         TEXT,
  phone         TEXT,
  role          TEXT DEFAULT 'picker' CHECK (role IN ('manager','picker','packer','shipper','receiver')),
  status        TEXT DEFAULT 'active' CHECK (status IN ('active','inactive','on_leave')),
  hourly_rate   NUMERIC(8,2),
  joined_date   DATE,
  created_at    TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.warehouse_workers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage warehouse workers" ON public.warehouse_workers FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.worker_shifts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id     UUID NOT NULL REFERENCES public.warehouse_workers(id) ON DELETE CASCADE,
  shift_date    DATE NOT NULL,
  start_time    TIME NOT NULL,
  end_time      TIME,
  hours_worked  NUMERIC(4,2),
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.worker_shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage worker shifts" ON public.worker_shifts FOR ALL
  USING (EXISTS (SELECT 1 FROM public.warehouse_workers w WHERE w.id = worker_id AND w.user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.worker_tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id     UUID NOT NULL REFERENCES public.warehouse_workers(id) ON DELETE CASCADE,
  order_id      UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  task_type     TEXT NOT NULL CHECK (task_type IN ('pick','pack','ship','receive','audit')),
  status        TEXT DEFAULT 'assigned' CHECK (status IN ('assigned','in_progress','completed','failed')),
  assigned_at   TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  completed_at  TIMESTAMPTZ,
  notes         TEXT
);

ALTER TABLE public.worker_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage worker tasks" ON public.worker_tasks FOR ALL
  USING (EXISTS (SELECT 1 FROM public.warehouse_workers w WHERE w.id = worker_id AND w.user_id = auth.uid()));


-- ─────────────────────────────────────────────────────────────────────────────
-- 14. SUPER ADMIN
-- ─────────────────────────────────────────────────────────────────────────────

-- Super admin view of all profiles (service_role / super_admin only)
CREATE OR REPLACE VIEW public.admin_users_view AS
  SELECT
    p.id,
    p.email,
    p.full_name,
    p.role,
    p.is_super_admin,
    s.plan_type,
    s.status AS subscription_status,
    p.created_at
  FROM public.profiles p
  LEFT JOIN public.subscriptions s ON s.user_id = p.id;


-- ─────────────────────────────────────────────────────────────────────────────
-- 15. INDEXES
-- ─────────────────────────────────────────────────────────────────────────────

-- Profiles
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- Products / Listings
CREATE INDEX IF NOT EXISTS idx_listings_user_id    ON public.listings(user_id);
CREATE INDEX IF NOT EXISTS idx_listings_sku        ON public.listings(user_id, sku);
CREATE INDEX IF NOT EXISTS idx_listings_asin       ON public.listings(user_id, asin);
CREATE INDEX IF NOT EXISTS idx_listings_status     ON public.listings(user_id, status);

-- Orders
CREATE INDEX IF NOT EXISTS idx_orders_user_id       ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_channel       ON public.orders(user_id, channel);
CREATE INDEX IF NOT EXISTS idx_orders_status        ON public.orders(user_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at    ON public.orders(user_id, created_at DESC);

-- Order Items
CREATE INDEX IF NOT EXISTS idx_order_items_order_id   ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_seller_sku ON public.order_items(seller_sku);

-- Analytics
CREATE INDEX IF NOT EXISTS idx_financial_metrics_user_date ON public.seller_financial_metrics(user_id, date);
CREATE INDEX IF NOT EXISTS idx_product_analytics_user_sku  ON public.product_analytics(user_id, sku);
CREATE INDEX IF NOT EXISTS idx_ad_logs_user_date           ON public.ad_performance_logs(user_id, date);

-- AI
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_user_id   ON public.ai_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_created   ON public.ai_usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_memory_user_id       ON public.ai_memory(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_schedules_next_run   ON public.ai_schedules(next_run ASC, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_ai_schedules_user_id    ON public.ai_schedules(user_id);

-- Jobs
CREATE INDEX IF NOT EXISTS idx_jobs_pending_run_at     ON public.jobs(job_type, status, run_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_jobs_user_created       ON public.jobs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_workspace_created  ON public.jobs(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_pending_or_stale   ON public.jobs(job_type, status, run_at, locked_until) WHERE status IN ('pending','running');

-- Events
CREATE INDEX IF NOT EXISTS idx_events_type_processed  ON public.events(event_type, processed);
CREATE INDEX IF NOT EXISTS idx_events_user_id         ON public.events(user_id);

-- System Metrics
CREATE INDEX IF NOT EXISTS idx_system_metrics_name_time ON public.system_metrics(metric_name, recorded_at);

-- Automation Executions
CREATE INDEX IF NOT EXISTS idx_automation_executions_worker     ON public.automation_executions(worker);
CREATE INDEX IF NOT EXISTS idx_automation_executions_status     ON public.automation_executions(status);
CREATE INDEX IF NOT EXISTS idx_automation_executions_started_at ON public.automation_executions(started_at);

-- Goals
CREATE INDEX IF NOT EXISTS idx_goals_user_status ON public.goals(user_id, status);

-- Amazon tokens
CREATE INDEX IF NOT EXISTS idx_amazon_tokens_user_id ON public.amazon_user_tokens(supabase_user_id);

-- Warehouse workers
CREATE INDEX IF NOT EXISTS idx_workers_user_id        ON public.warehouse_workers(user_id);
CREATE INDEX IF NOT EXISTS idx_worker_shifts_date     ON public.worker_shifts(shift_date);
CREATE INDEX IF NOT EXISTS idx_worker_tasks_status    ON public.worker_tasks(status);


-- ─────────────────────────────────────────────────────────────────────────────
-- NOTIFY PostgREST to reload schema
-- ─────────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
