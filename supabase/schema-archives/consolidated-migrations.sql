-- ==========================================
-- MIGRATION: 20260623_initial_schema.sql
-- ==========================================

-- 20260623_initial_schema.sql
-- Initial Schema Setup for SellerPlus

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Profiles (Extends auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null unique,
  full_name text,
  avatar_url text,
  role text default 'owner' check (role in ('owner', 'admin', 'manager', 'analyst', 'employee', 'read-only')),
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.profiles enable row level security;
create policy "Users can view their own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update their own profile" on public.profiles for update using (auth.uid() = id);

-- Subscriptions
create table public.subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  status text not null check (status in ('active', 'trialing', 'past_due', 'canceled', 'incomplete')),
  plan_type text not null check (plan_type in ('free', 'weekly', 'pro', 'business')),
  current_period_start timestamp with time zone not null,
  current_period_end timestamp with time zone not null,
  cancel_at_period_end boolean default false not null,
  razorpay_subscription_id text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.subscriptions enable row level security;
create policy "Users can view their own subscription" on public.subscriptions for select using (auth.uid() = user_id);

-- Payments
create table public.payments (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  order_id text not null,
  payment_id text,
  signature text,
  amount numeric(10, 2) not null,
  currency text default 'INR' not null,
  status text not null check (status in ('pending', 'captured', 'failed', 'refunded')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.payments enable row level security;
create policy "Users can view their own payments" on public.payments for select using (auth.uid() = user_id);

-- Products
create table public.products (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  sku text not null,
  name text not null,
  description text,
  image_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (user_id, sku)
);

alter table public.products enable row level security;
create policy "Users can manage their own products" on public.products for all using (auth.uid() = user_id);

-- Product Variants
create table public.variants (
  id uuid default gen_random_uuid() primary key,
  product_id uuid references public.products(id) on delete cascade not null,
  sku text not null,
  name text not null,
  price numeric(10, 2) default 0.00 not null,
  stock int default 0 not null,
  attributes jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (product_id, sku)
);

alter table public.variants enable row level security;
create policy "Users can manage their own variants" on public.variants for all using (
  exists (select 1 from public.products p where p.id = product_id and p.user_id = auth.uid())
);

-- Master SKU mapping
create table public.master_skus (
  id uuid default gen_random_uuid() primary key,
  product_id uuid references public.products(id) on delete cascade not null,
  channel text not null check (channel in ('amazon', 'flipkart', 'meesho', 'shopify')),
  channel_sku text not null,
  channel_product_id text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.master_skus enable row level security;
create policy "Users can manage their master SKU mapping" on public.master_skus for all using (
  exists (select 1 from public.products p where p.id = product_id and p.user_id = auth.uid())
);

-- Listings
create table public.listings (
  id uuid default gen_random_uuid() primary key,
  master_sku_id uuid references public.master_skus(id) on delete cascade not null,
  channel text not null check (channel in ('amazon', 'flipkart', 'meesho', 'shopify')),
  title text not null,
  description text,
  price numeric(10, 2) not null,
  status text not null check (status in ('active', 'inactive', 'suppressed')),
  rating numeric(3, 2),
  reviews_count int default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.listings enable row level security;
create policy "Users can manage their own listings" on public.listings for all using (
  exists (
    select 1 from public.master_skus ms 
    join public.products p on p.id = ms.product_id 
    where ms.id = master_sku_id and p.user_id = auth.uid()
  )
);

-- Listing Versions
create table public.listing_versions (
  id uuid default gen_random_uuid() primary key,
  listing_id uuid references public.listings(id) on delete cascade not null,
  title text not null,
  description text,
  bullet_points text[],
  keywords text[],
  score_overall numeric(3, 1),
  score_seo numeric(3, 1),
  score_conversion numeric(3, 1),
  score_image numeric(3, 1),
  score_keyword numeric(3, 1),
  suggestions jsonb default '[]'::jsonb,
  version_number int not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.listing_versions enable row level security;
create policy "Users can manage listing versions" on public.listing_versions for all using (
  exists (
    select 1 from public.listings l
    join public.master_skus ms on ms.id = l.master_sku_id
    join public.products p on p.id = ms.product_id
    where l.id = listing_id and p.user_id = auth.uid()
  )
);

-- Warehouses
create table public.warehouses (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  type text not null check (type in ('self', 'fba', '3pl')),
  address text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.warehouses enable row level security;
create policy "Users can manage warehouses" on public.warehouses for all using (auth.uid() = user_id);

-- Inventory
create table public.inventory (
  id uuid default gen_random_uuid() primary key,
  variant_id uuid references public.variants(id) on delete cascade not null,
  warehouse_id uuid references public.warehouses(id) on delete cascade not null,
  quantity int default 0 not null,
  safety_stock int default 10 not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.inventory enable row level security;
create policy "Users can manage inventory" on public.inventory for all using (
  exists (
    select 1 from public.variants v
    join public.products p on p.id = v.product_id
    where v.id = variant_id and p.user_id = auth.uid()
  )
);

-- Orders
create table public.orders (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  channel text not null check (channel in ('amazon', 'flipkart', 'meesho', 'shopify')),
  channel_order_id text not null,
  status text not null check (status in ('pending', 'packed', 'shipped', 'delivered', 'returned', 'cancelled')),
  total_amount numeric(10, 2) not null,
  currency text default 'INR' not null,
  customer_name text,
  shipping_address jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.orders enable row level security;
create policy "Users can view their orders" on public.orders for all using (auth.uid() = user_id);

-- Shipments
create table public.shipments (
  id uuid default gen_random_uuid() primary key,
  order_id uuid references public.orders(id) on delete cascade not null,
  carrier text not null,
  tracking_number text,
  status text not null,
  label_url text,
  awb_code text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.shipments enable row level security;
create policy "Users can view shipments" on public.shipments for all using (
  exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
);

-- Returns
create table public.returns (
  id uuid default gen_random_uuid() primary key,
  order_id uuid references public.orders(id) on delete cascade not null,
  channel_return_id text,
  status text not null,
  reason text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.returns enable row level security;
create policy "Users can view returns" on public.returns for all using (
  exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
);

-- Keywords
create table public.keywords (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  keyword text not null,
  search_volume int,
  difficulty_score int,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (user_id, keyword)
);

alter table public.keywords enable row level security;
create policy "Users can manage keywords" on public.keywords for all using (auth.uid() = user_id);

-- Keyword Rankings
create table public.keyword_rankings (
  id uuid default gen_random_uuid() primary key,
  keyword_id uuid references public.keywords(id) on delete cascade not null,
  listing_id uuid references public.listings(id) on delete cascade not null,
  rank int not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.keyword_rankings enable row level security;
create policy "Users can view keyword rankings" on public.keyword_rankings for all using (
  exists (select 1 from public.keywords k where k.id = keyword_id and k.user_id = auth.uid())
);

-- Competitors
create table public.competitors (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  competitor_name text not null,
  asin_or_sku text not null,
  rating numeric(3, 2),
  reviews_count int default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (user_id, asin_or_sku)
);

alter table public.competitors enable row level security;
create policy "Users can manage competitors" on public.competitors for all using (auth.uid() = user_id);

-- Expenses
create table public.expenses (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  amount numeric(10, 2) not null,
  date date not null,
  category text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.expenses enable row level security;
create policy "Users can manage expenses" on public.expenses for all using (auth.uid() = user_id);

-- Alerts
create table public.alerts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  type text not null check (type in ('low_stock', 'listing_suppression', 'profit_drop', 'keyword_drop')),
  message text not null,
  is_resolved boolean default false not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.alerts enable row level security;
create policy "Users can manage their alerts" on public.alerts for all using (auth.uid() = user_id);

-- Notifications
create table public.notifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  channel text not null check (channel in ('email', 'push', 'whatsapp', 'in-app')),
  title text not null,
  content text not null,
  sent_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.notifications enable row level security;
create policy "Users can view their notifications" on public.notifications for select using (auth.uid() = user_id);

-- Audit Logs
create table public.audit_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  action text not null,
  details jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.audit_logs enable row level security;
create policy "Users can view their audit logs" on public.audit_logs for select using (auth.uid() = user_id);

-- Activities
create table public.activities (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  activity_type text not null,
  message text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.activities enable row level security;
create policy "Users can view their activities" on public.activities for select using (auth.uid() = user_id);

-- API Keys
create table public.api_keys (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  key_hash text not null unique,
  name text not null,
  permissions text[] default '{}'::text[],
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.api_keys enable row level security;
create policy "Users can manage their API keys" on public.api_keys for all using (auth.uid() = user_id);

-- Support Tickets
create table public.support_tickets (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  description text not null,
  status text not null check (status in ('open', 'in_progress', 'resolved', 'closed')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.support_tickets enable row level security;
create policy "Users can manage support tickets" on public.support_tickets for all using (auth.uid() = user_id);

-- AI Generations
create table public.ai_generations (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  generation_type text not null check (generation_type in ('judge', 'keyword', 'copywriter', 'assistant')),
  input_tokens int,
  output_tokens int,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.ai_generations enable row level security;
create policy "Users can view their AI generations" on public.ai_generations for select using (auth.uid() = user_id);

-- Create profile on signup trigger
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'avatar_url', ''),
    'owner'
  );
  
  -- Create free subscription automatically
  insert into public.subscriptions (user_id, status, plan_type, current_period_start, current_period_end)
  values (
    new.id,
    'active',
    'free',
    now(),
    now() + interval '30 days'
  );
  
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ==========================================
-- MIGRATION: 20260629_listings_management.sql
-- ==========================================

-- supabase/migrations/20260629_listings_management.sql
-- Database extensions for listings management

-- 1. Redefine status check constraint on public.listings and make master_sku_id nullable
alter table public.listings drop constraint if exists listings_status_check;
alter table public.listings alter column master_sku_id drop not null;

-- Add draft and active check constraint
alter table public.listings add constraint listings_status_check check (status in ('active', 'inactive', 'suppressed', 'draft'));

-- 2. Add properties, attributes, pricing, fulfillment and inventory columns to listings
alter table public.listings add column if not exists user_id uuid references public.profiles(id) on delete cascade;
alter table public.listings add column if not exists asin text;
alter table public.listings add column if not exists sku text;
alter table public.listings add column if not exists fnsku text;
alter table public.listings add column if not exists parent_asin text;
alter table public.listings add column if not exists brand text;
alter table public.listings add column if not exists manufacturer text;
alter table public.listings add column if not exists product_type text;

-- Content
alter table public.listings add column if not exists bullet_points text[] default '{}'::text[];
alter table public.listings add column if not exists aplus_content jsonb default '{}'::jsonb;
alter table public.listings add column if not exists backend_keywords text[] default '{}'::text[];
alter table public.listings add column if not exists search_terms text[] default '{}'::text[];
alter table public.listings add column if not exists subject_matter text;
alter table public.listings add column if not exists target_audience text;

-- Images
alter table public.listings add column if not exists main_image text;
alter table public.listings add column if not exists gallery_images text[] default '{}'::text[];
alter table public.listings add column if not exists alt_images text[] default '{}'::text[];

-- Physical attributes
alter table public.listings add column if not exists color text;
alter table public.listings add column if not exists size text;
alter table public.listings add column if not exists material text;
alter table public.listings add column if not exists dimensions text;
alter table public.listings add column if not exists weight text;
alter table public.listings add column if not exists package_info text;
alter table public.listings add column if not exists country_of_origin text;

-- Pricing & Inventory
alter table public.listings add column if not exists sale_price numeric(10, 2);
alter table public.listings add column if not exists business_price numeric(10, 2);
alter table public.listings add column if not exists available_qty int default 0;
alter table public.listings add column if not exists reserved_qty int default 0;
alter table public.listings add column if not exists incoming_qty int default 0;
alter table public.listings add column if not exists reorder_qty int default 0;

-- Fulfillment
alter table public.listings add column if not exists fulfillment_channel text default 'FBA' check (fulfillment_channel in ('FBA', 'FBM'));
alter table public.listings add column if not exists shipping_settings jsonb default '{}'::jsonb;
alter table public.listings add column if not exists package_settings jsonb default '{}'::jsonb;

-- Performance & Analytics
alter table public.listings add column if not exists performance_category text default 'working';
alter table public.listings add column if not exists performance_custom_thresholds jsonb default '{"min_sales_winner": 20, "max_refund_dead": 10}'::jsonb;
alter table public.listings add column if not exists price_history jsonb default '[]'::jsonb;
alter table public.listings add column if not exists sales_30d int default 0;
alter table public.listings add column if not exists revenue_30d numeric(12, 2) default 0.00;
alter table public.listings add column if not exists orders_30d int default 0;
alter table public.listings add column if not exists units_sold_30d int default 0;
alter table public.listings add column if not exists conversion_rate_30d numeric(5, 2) default 0.00;
alter table public.listings add column if not exists seo_score int default 100;
alter table public.listings add column if not exists seo_keyword_analysis jsonb default '{}'::jsonb;

-- Backfill user_id from master_skus if exists
update public.listings l
set user_id = p.user_id
from public.master_skus ms
join public.products p on p.id = ms.product_id
where l.master_sku_id = ms.id and l.user_id is null;

-- Enable RLS & direct policies on public.listings
drop policy if exists "Users can manage their own listings" on public.listings;
create policy "Users can manage their own listings" on public.listings 
  for all using (auth.uid() = user_id) 
  with check (auth.uid() = user_id);

-- 3. Extend public.listing_versions for full state snap-shotting
alter table public.listing_versions add column if not exists snapshot_data jsonb default '{}'::jsonb;
alter table public.listing_versions add column if not exists change_summary text;
alter table public.listing_versions add column if not exists user_action text default 'Edit';

drop policy if exists "Users can manage listing versions" on public.listing_versions;
create policy "Users can manage listing versions" on public.listing_versions
  for all using (
    exists (
      select 1 from public.listings l
      where l.id = listing_id and l.user_id = auth.uid()
    )
  );

-- Indexes for listings queries
create index if not exists idx_listings_user_id on public.listings(user_id);
create index if not exists idx_listings_sku on public.listings(user_id, sku);
create index if not exists idx_listings_asin on public.listings(user_id, asin);


-- ==========================================
-- MIGRATION: 20260629_sellerboard_analytics.sql
-- ==========================================

-- supabase/migrations/20260629_sellerboard_analytics.sql
-- Database Migrations for the Sellerboard Analytics Platform

-- 1. Seller Financial Metrics (aggregated daily/weekly financial data)
create table if not exists public.seller_financial_metrics (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  date date not null,
  revenue numeric(12, 2) default 0.00 not null,
  orders_count int default 0 not null,
  units_sold int default 0 not null,
  cogs numeric(12, 2) default 0.00 not null,         -- cost of goods sold
  shipping_cost numeric(12, 2) default 0.00 not null,
  amazon_fees numeric(12, 2) default 0.00 not null,   -- FBA + referral fees
  ad_spend numeric(12, 2) default 0.00 not null,
  ad_sales numeric(12, 2) default 0.00 not null,
  refund_costs numeric(12, 2) default 0.00 not null,
  refund_count int default 0 not null,
  net_profit numeric(12, 2) default 0.00 not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (user_id, date)
);

alter table public.seller_financial_metrics enable row level security;
create policy "Users can manage their own financial metrics" on public.seller_financial_metrics for all using (auth.uid() = user_id);
create index if not exists idx_financial_metrics_user_date on public.seller_financial_metrics(user_id, date);

-- 2. Product Analytics (detailed metrics per SKU)
create table if not exists public.product_analytics (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  sku text not null,
  asin text,
  name text not null,
  revenue numeric(12, 2) default 0.00 not null,
  units_sold int default 0 not null,
  cogs numeric(12, 2) default 0.00 not null,
  amazon_fees numeric(12, 2) default 0.00 not null,
  net_profit numeric(12, 2) default 0.00 not null,
  refund_count int default 0 not null,
  refund_rate numeric(5, 2) default 0.00 not null,   -- refund count / units sold %
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (user_id, sku)
);

alter table public.product_analytics enable row level security;
create policy "Users can manage their own product analytics" on public.product_analytics for all using (auth.uid() = user_id);
create index if not exists idx_product_analytics_user_sku on public.product_analytics(user_id, sku);

-- 3. PPC/Ad Performance Logs
create table if not exists public.ad_performance_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  date date not null,
  campaign_name text not null,
  spend numeric(10, 2) default 0.00 not null,
  sales numeric(12, 2) default 0.00 not null,
  impressions int default 0 not null,
  clicks int default 0 not null,
  conversions int default 0 not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.ad_performance_logs enable row level security;
create policy "Users can manage their own PPC metrics" on public.ad_performance_logs for all using (auth.uid() = user_id);
create index if not exists idx_ad_logs_user_date on public.ad_performance_logs(user_id, date);

-- 4. Inventory Planner Metrics
create table if not exists public.inventory_planner (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  sku text not null,
  name text not null,
  current_stock int default 0 not null,
  incoming_stock int default 0 not null,
  daily_velocity numeric(6, 2) default 0.00 not null, -- daily units sold avg
  days_until_stockout int,                             -- null means infinity (0 velocity)
  reorder_qty int default 0 not null,
  status_color text default 'green' check (status_color in ('green', 'yellow', 'red')),
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (user_id, sku)
);

alter table public.inventory_planner enable row level security;
create policy "Users can manage their own inventory planner" on public.inventory_planner for all using (auth.uid() = user_id);
create index if not exists idx_inventory_planner_user_sku on public.inventory_planner(user_id, sku);

-- 5. Widget Layouts (for saving draggable-resizable widgets positions)
create table if not exists public.widget_layouts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  widget_id text not null,
  col_span int default 1 not null,
  row_span int default 1 not null,
  x_pos int default 0 not null,
  y_pos int default 0 not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (user_id, widget_id)
);

alter table public.widget_layouts enable row level security;
create policy "Users can manage their own widget layouts" on public.widget_layouts for all using (auth.uid() = user_id);
create index if not exists idx_widget_layouts_user on public.widget_layouts(user_id);

-- 6. Alert Logs (for low stock, sales drops, refunds warnings)
create table if not exists public.alert_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  type text not null check (type in ('low_stock', 'sales_drop', 'high_refunds', 'profit_decrease', 'out_of_stock_risk')),
  title text not null,
  message text not null,
  is_read boolean default false not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.alert_logs enable row level security;
create policy "Users can manage their own alert logs" on public.alert_logs for all using (auth.uid() = user_id);
create index if not exists idx_alert_logs_user_read on public.alert_logs(user_id, is_read);


-- ==========================================
-- MIGRATION: 20260701_amazon_kw_tables.sql
-- ==========================================

-- Amazon KW™ Module Tables
-- Created: 2026-07-01

-- Keyword Projects / Folders
CREATE TABLE IF NOT EXISTS keyword_projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT 'emerald',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Keyword Lists (belong to a project)
CREATE TABLE IF NOT EXISTS keyword_lists (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES keyword_projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  keyword_seed TEXT,
  category TEXT,
  marketplace TEXT DEFAULT 'Amazon India',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Saved Keywords (individual keywords saved to a list)
CREATE TABLE IF NOT EXISTS saved_keywords (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  list_id UUID REFERENCES keyword_lists(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  search_volume INTEGER,
  difficulty INTEGER,
  opportunity_score INTEGER,
  cpc NUMERIC(8,2),
  kw_type TEXT,
  intent TEXT,
  trend TEXT,
  notes TEXT,
  is_starred BOOLEAN DEFAULT FALSE,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Keyword Research History (auto-saved searches)
CREATE TABLE IF NOT EXISTS keyword_search_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  marketplace TEXT DEFAULT 'Amazon India',
  category TEXT,
  volume INTEGER,
  difficulty INTEGER,
  opportunity_score INTEGER,
  searched_at TIMESTAMPTZ DEFAULT now()
);

-- RLS Policies
ALTER TABLE keyword_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE keyword_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE keyword_search_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own keyword_projects" ON keyword_projects FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own keyword_lists" ON keyword_lists FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own saved_keywords" ON saved_keywords FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own keyword_search_history" ON keyword_search_history FOR ALL USING (auth.uid() = user_id);


-- ==========================================
-- MIGRATION: 20260709_goals_system.sql
-- ==========================================

-- Goals System Migration
-- Created: 2026-07-09

CREATE TABLE IF NOT EXISTS public.goals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  target_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  current_savings NUMERIC(12, 2) NOT NULL DEFAULT 0,
  deadline DATE,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'dream')),
  is_completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  color TEXT DEFAULT 'indigo',
  category TEXT DEFAULT 'purchase',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own goals" ON public.goals FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_goals_user ON public.goals(user_id);

-- Milestone achievements table
CREATE TABLE IF NOT EXISTS public.milestones (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  milestone_key TEXT NOT NULL,
  achieved_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(user_id, milestone_key)
);

ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own milestones" ON public.milestones FOR ALL USING (auth.uid() = user_id);


-- ==========================================
-- MIGRATION: 20260710_goals_rls_hotfix.sql
-- ==========================================

-- Migration: Goals & Milestones anonymous/local sandbox testing RLS policies
-- Fixes Supabase 401 / 400 errors for /rest/v1/goals and /rest/v1/milestones in local development

-- 1. Enable RLS on goals (precautionary)
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

-- 2. Add anonymous testing policy for goals
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='goals' AND policyname='Allow anonymous local testing for goals'
  ) THEN
    CREATE POLICY "Allow anonymous local testing for goals" 
      ON public.goals 
      FOR ALL USING (auth.role() = 'anon') WITH CHECK (auth.role() = 'anon');
  END IF;
END $$;

-- 3. Enable RLS on milestones (precautionary)
ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;

-- 4. Add anonymous testing policy for milestones
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='milestones' AND policyname='Allow anonymous local testing for milestones'
  ) THEN
    CREATE POLICY "Allow anonymous local testing for milestones" 
      ON public.milestones 
      FOR ALL USING (auth.role() = 'anon') WITH CHECK (auth.role() = 'anon');
  END IF;
END $$;


-- ==========================================
-- MIGRATION: 20260710_orders_production.sql
-- ==========================================

-- Migration: Orders production schema updates
-- Adds unique constraint on orders table and creates order_items table

-- 1. Add unique constraint to prevent duplicate order imports
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_unique_channel_order'
  ) THEN
    ALTER TABLE public.orders
    ADD CONSTRAINT orders_unique_channel_order UNIQUE (user_id, channel, channel_order_id);
  END IF;
END $$;

-- 2. Add Amazon-specific columns to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS purchase_date TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS last_update_date TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS fulfillment_channel TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS marketplace_id TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS number_of_items_shipped INT DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS number_of_items_unshipped INT DEFAULT 0;

-- 3. Relax the status check constraint to accept Amazon's native statuses
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check 
  CHECK (status IN ('pending', 'packed', 'shipped', 'delivered', 'returned', 'cancelled', 'Pending', 'Unshipped', 'PartiallyShipped', 'Shipped', 'Canceled', 'Unfulfillable', 'InvoiceUnconfirmed', 'PendingAvailability'));

-- 4. Create order_items table
CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  amazon_order_item_id TEXT,
  seller_sku TEXT,
  asin TEXT,
  title TEXT,
  quantity_ordered INT DEFAULT 0,
  quantity_shipped INT DEFAULT 0,
  item_price NUMERIC(10, 2) DEFAULT 0,
  item_price_currency TEXT DEFAULT 'INR',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 5. Add unique constraint on order_items to prevent duplicates
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_items_unique_item'
  ) THEN
    ALTER TABLE public.order_items
    ADD CONSTRAINT order_items_unique_item UNIQUE (order_id, amazon_order_item_id);
  END IF;
END $$;

-- 6. Enable RLS on order_items
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='order_items' AND policyname='Users can view order items'
  ) THEN
    CREATE POLICY "Users can view order items" ON public.order_items FOR ALL USING (
      EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = auth.uid())
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='order_items' AND policyname='Allow anonymous local testing for order items'
  ) THEN
    CREATE POLICY "Allow anonymous local testing for order items" ON public.order_items FOR ALL USING (
      auth.role() = 'anon'
    );
  END IF;
END $$;

-- 7. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_orders_user_channel ON public.orders(user_id, channel);
CREATE INDEX IF NOT EXISTS idx_orders_purchase_date ON public.orders(purchase_date);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_seller_sku ON public.order_items(seller_sku);


-- ==========================================
-- MIGRATION: 20260710_production_erp_schema.sql
-- ==========================================

-- Migration: Production ERP Schema Updates
-- Installs Cost Profiles, Expenses, Raw Materials, Profit/Fee columns on orders, and RLS policies

-- 1. Create Cost Profiles table
CREATE TABLE IF NOT EXISTS public.cost_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  printing_cost NUMERIC(10,2) DEFAULT 0 NOT NULL,
  material_cost NUMERIC(10,2) DEFAULT 0 NOT NULL,
  packaging_cost NUMERIC(10,2) DEFAULT 0 NOT NULL,
  shipping_cost NUMERIC(10,2) DEFAULT 0 NOT NULL,
  labor_cost NUMERIC(10,2) DEFAULT 0 NOT NULL,
  misc_cost NUMERIC(10,2) DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE (user_id, name)
);

-- Enable RLS & Policies for Cost Profiles
ALTER TABLE public.cost_profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cost_profiles' AND policyname='Users own cost profiles') THEN
    CREATE POLICY "Users own cost profiles" ON public.cost_profiles FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cost_profiles' AND policyname='Allow anonymous local testing for cost profiles') THEN
    CREATE POLICY "Allow anonymous local testing for cost profiles" ON public.cost_profiles FOR ALL USING (auth.role() = 'anon') WITH CHECK (auth.role() = 'anon');
  END IF;
END $$;


-- 2. Alter Listings table to link to Cost Profiles
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS cost_profile_id UUID REFERENCES public.cost_profiles(id) ON DELETE SET NULL;


-- 3. Alter Orders table to store fee allocations and profits
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS commission_fees NUMERIC(10,2) DEFAULT 0 NOT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS fba_fees NUMERIC(10,2) DEFAULT 0 NOT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_cost NUMERIC(10,2) DEFAULT 0 NOT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS advertising_cost NUMERIC(10,2) DEFAULT 0 NOT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS gross_profit NUMERIC(10,2) DEFAULT 0 NOT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS net_profit NUMERIC(10,2) DEFAULT 0 NOT NULL;


-- 4. Create Expense Tracking table
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  category TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT DEFAULT 'INR' NOT NULL,
  description TEXT,
  date DATE NOT NULL,
  is_recurring BOOLEAN DEFAULT false NOT NULL,
  recurrence_interval TEXT CHECK (recurrence_interval IN ('daily', 'weekly', 'monthly', 'yearly')),
  receipt_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS & Policies for Expenses
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='expenses' AND policyname='Users own expenses') THEN
    CREATE POLICY "Users own expenses" ON public.expenses FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='expenses' AND policyname='Allow anonymous local testing for expenses') THEN
    CREATE POLICY "Allow anonymous local testing for expenses" ON public.expenses FOR ALL USING (auth.role() = 'anon') WITH CHECK (auth.role() = 'anon');
  END IF;
END $$;


-- 5. Create Raw Materials Inventory table
CREATE TABLE IF NOT EXISTS public.raw_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  current_stock INT DEFAULT 0 NOT NULL,
  minimum_stock INT DEFAULT 10 NOT NULL,
  unit TEXT NOT NULL, -- 'pcs', 'grams', 'meters', 'tubes', etc.
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE (user_id, name)
);

-- Enable RLS & Policies for Raw Materials
ALTER TABLE public.raw_materials ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='raw_materials' AND policyname='Users own raw materials') THEN
    CREATE POLICY "Users own raw materials" ON public.raw_materials FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='raw_materials' AND policyname='Allow anonymous local testing for raw materials') THEN
    CREATE POLICY "Allow anonymous local testing for raw materials" ON public.raw_materials FOR ALL USING (auth.role() = 'anon') WITH CHECK (auth.role() = 'anon');
  END IF;
END $$;


-- 6. Add Anonymous Policy for Returns table
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='returns' AND policyname='Allow anonymous local testing for returns') THEN
    CREATE POLICY "Allow anonymous local testing for returns" ON public.returns FOR ALL USING (auth.role() = 'anon') WITH CHECK (auth.role() = 'anon');
  END IF;
END $$;


-- ==========================================
-- MIGRATION: 20260711_goals_analytics.sql
-- ==========================================

-- Migration: Goals analytics tracking columns
-- Adds metric, start_date, and savings_percentage columns to public.goals for automatic progress calculation.

ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS metric TEXT DEFAULT 'savings' CHECK (metric IN ('savings', 'revenue', 'profit', 'orders', 'units_sold', 'listings', 'visitors', 'repeat_customers', 'reviews', 'active_products', 'custom'));
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS start_date DATE DEFAULT CURRENT_DATE NOT NULL;
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS savings_percentage NUMERIC(5, 2) DEFAULT 0 NOT NULL;


-- ==========================================
-- MIGRATION: 20260712_00_super_admin_prelude.sql
-- ==========================================

-- Prelude: Ensure super-admin columns and helper exist before other migrations
-- This migration is intentionally ordered to run before other 20260712_* files.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT false NOT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT false NOT NULL;

-- Create or replace a SECURITY DEFINER helper so policies can reference it safely
CREATE OR REPLACE FUNCTION public.is_super_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = user_id AND is_super_admin = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- No policies here; the main super_admin migration still creates profile/workspace policies.

NOTIFY pgrst, 'reload schema';


-- ==========================================
-- MIGRATION: 20260712_01_llm_settings.sql
-- ==========================================

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


-- ==========================================
-- MIGRATION: 20260712_02_notification_settings.sql
-- ==========================================

-- Migration: Notification Destinations Schema
-- Creates notification_settings table for user-configured Discord, Telegram, and Email alerts

CREATE TABLE IF NOT EXISTS public.notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  email_destination TEXT,
  discord_webhook_url TEXT,
  telegram_bot_token TEXT,
  telegram_chat_id TEXT,
  enable_low_stock_alerts BOOLEAN DEFAULT true NOT NULL,
  enable_daily_summaries BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE (user_id)
);

-- Enable RLS
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='notification_settings' AND policyname='Users own notification settings'
  ) THEN
    CREATE POLICY "Users own notification settings" ON public.notification_settings 
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='notification_settings' AND policyname='Allow anonymous local testing for notification settings'
  ) THEN
    CREATE POLICY "Allow anonymous local testing for notification settings" ON public.notification_settings 
      FOR ALL USING (auth.role() = 'anon') WITH CHECK (auth.role() = 'anon');
  END IF;
END $$;

-- Update trigger
CREATE OR REPLACE TRIGGER on_notification_settings_updated
  BEFORE UPDATE ON public.notification_settings
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();


-- ==========================================
-- MIGRATION: 20260712_03_ads_refunds_alerts.sql
-- ==========================================

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


-- ==========================================
-- MIGRATION: 20260712_04_multi_tenant_workspaces.sql
-- ==========================================

-- Migration: Multi-tenant Workspaces Schema
-- Creates workspaces and workspace_members tables, with RLS policies and triggers.

CREATE TABLE IF NOT EXISTS public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(workspace_id, user_id)
);

-- Enable RLS
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

-- Workspaces RLS Policies
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='workspaces' AND policyname='Users can view workspaces they are members of'
  ) THEN
    CREATE POLICY "Users can view workspaces they are members of" ON public.workspaces
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.workspace_members m 
          WHERE m.workspace_id = id AND m.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='workspaces' AND policyname='Allow anonymous local testing for workspaces'
  ) THEN
    CREATE POLICY "Allow anonymous local testing for workspaces" ON public.workspaces 
      FOR ALL USING (auth.role() = 'anon') WITH CHECK (auth.role() = 'anon');
  END IF;
END $$;

-- Workspace Members RLS Policies
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='workspace_members' AND policyname='Users can view membership of their workspaces'
  ) THEN
    CREATE POLICY "Users can view membership of their workspaces" ON public.workspace_members
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.workspace_members m 
          WHERE m.workspace_id = workspace_id AND m.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='workspace_members' AND policyname='Allow anonymous local testing for workspace_members'
  ) THEN
    CREATE POLICY "Allow anonymous local testing for workspace_members" ON public.workspace_members 
      FOR ALL USING (auth.role() = 'anon') WITH CHECK (auth.role() = 'anon');
  END IF;
END $$;

-- Update trigger for workspaces updated_at
CREATE OR REPLACE TRIGGER on_workspaces_updated
  BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();


-- ==========================================
-- MIGRATION: 20260712_05_super_admin.sql
-- ==========================================

-- Migration: Super Admin & Suspension Schema
-- Adds is_super_admin and is_suspended flags to profiles with RLS policies bypassing recursion

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT false NOT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT false NOT NULL;

-- Definer function to check super-admin status bypassing RLS recursion
CREATE OR REPLACE FUNCTION public.is_super_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = user_id AND is_super_admin = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Profiles RLS policies for Super Admin
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='profiles' AND policyname='Super-admins can select all profiles'
  ) THEN
    CREATE POLICY "Super-admins can select all profiles" ON public.profiles
      FOR SELECT USING (public.is_super_admin(auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='profiles' AND policyname='Super-admins can update all profiles'
  ) THEN
    CREATE POLICY "Super-admins can update all profiles" ON public.profiles
      FOR UPDATE USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
  END IF;
END $$;

-- Workspaces RLS policies for Super Admin
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='workspaces' AND policyname='Super-admins can select all workspaces'
  ) THEN
    CREATE POLICY "Super-admins can select all workspaces" ON public.workspaces
      FOR SELECT USING (public.is_super_admin(auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='workspaces' AND policyname='Super-admins can update all workspaces'
  ) THEN
    CREATE POLICY "Super-admins can update all workspaces" ON public.workspaces
      FOR UPDATE USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
  END IF;
END $$;

-- Workspace Members RLS policies for Super Admin
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='workspace_members' AND policyname='Super-admins can select all workspace members'
  ) THEN
    CREATE POLICY "Super-admins can select all workspace members" ON public.workspace_members
      FOR SELECT USING (public.is_super_admin(auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='workspace_members' AND policyname='Super-admins can update all workspace members'
  ) THEN
    CREATE POLICY "Super-admins can update all workspace members" ON public.workspace_members
      FOR ALL USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
  END IF;
END $$;

-- Subscriptions RLS policies for Super Admin
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='subscriptions' AND policyname='Super-admins can select all subscriptions'
  ) THEN
    CREATE POLICY "Super-admins can select all subscriptions" ON public.subscriptions
      FOR SELECT USING (public.is_super_admin(auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='subscriptions' AND policyname='Super-admins can update all subscriptions'
  ) THEN
    CREATE POLICY "Super-admins can update all subscriptions" ON public.subscriptions
      FOR UPDATE USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
  END IF;
END $$;

-- Seed a default super_admin account for the main profile (Owner session fallback)
UPDATE public.profiles SET is_super_admin = true WHERE email = 'seller@sellerplus.in' OR email = 'owner@sellerplus.in';

NOTIFY pgrst, 'reload schema';


-- ==========================================
-- MIGRATION: 20260712_06_handle_new_user_workspace.sql
-- ==========================================

-- Migration: Auto-workspace trigger on signup
-- Updates handle_new_user trigger function to automatically initialize a default workspace and set membership role.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_workspace_id UUID;
  default_name TEXT;
BEGIN
  -- Determine default name
  default_name := COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1));

  -- 1. Insert Profile
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    default_name,
    'owner'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name);

  -- 2. Insert Workspace
  INSERT INTO public.workspaces (name)
  VALUES (default_name || ' Workspace')
  RETURNING id INTO new_workspace_id;

  -- 3. Insert Workspace Member
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (new_workspace_id, NEW.id, 'owner');

  -- 4. Insert Free Subscription
  INSERT INTO public.subscriptions (user_id, status, plan_type, current_period_start, current_period_end)
  VALUES (
    NEW.id,
    'active',
    'free',
    now(),
    now() + interval '30 days'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ==========================================
-- MIGRATION: 20260712_07_fix_rls_recursion.sql
-- ==========================================

-- Migration: Fix workspace_members RLS Infinite Recursion
-- Creates security definer helper to query workspace memberships bypassing recursion

CREATE OR REPLACE FUNCTION public.is_workspace_member(checking_user_id UUID, check_workspace_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = check_workspace_id AND user_id = checking_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop recursive policies
DROP POLICY IF EXISTS "Users can view workspaces they are members of" ON public.workspaces;
DROP POLICY IF EXISTS "Users can view membership of their workspaces" ON public.workspace_members;

-- Recreate with helper function
CREATE POLICY "Users can view workspaces they are members of" ON public.workspaces
  FOR SELECT USING (public.is_workspace_member(auth.uid(), id));

CREATE POLICY "Users can view membership of their workspaces" ON public.workspace_members
  FOR SELECT USING (user_id = auth.uid() OR public.is_workspace_member(auth.uid(), workspace_id));


-- ==========================================
-- MIGRATION: 20260712_08_order_items_listing_relation.sql
-- ==========================================

-- Migration: Add listing_id foreign key relation to order_items
-- Links order items to listings for relational joins and detailed product metadata mapping.

ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS listing_id UUID REFERENCES public.listings(id) ON DELETE SET NULL;


-- ==========================================
-- MIGRATION: 20260712_09_recalculate_profits_triggers.sql
-- ==========================================

-- Migration: Recalculate Profit Triggers
-- Automates retroactive profit calculations when cost profiles or listings are updated

-- 1. Helper to recalculate profit for a single order
CREATE OR REPLACE FUNCTION public.recalculate_order_profit(target_order_id UUID)
RETURNS VOID AS $$
DECLARE
  order_user_id UUID;
  total_cogs NUMERIC(10,2) := 0;
  row_item RECORD;
  profile_rec RECORD;
  unit_cost NUMERIC(10,2);
  v_gross_profit NUMERIC(10,2);
  v_net_profit NUMERIC(10,2);
BEGIN
  -- Fetch order details
  SELECT user_id, gross_profit INTO order_user_id, v_gross_profit FROM public.orders WHERE id = target_order_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Iterate through items and map costs
  FOR row_item IN 
    SELECT seller_sku, quantity_ordered FROM public.order_items WHERE order_id = target_order_id
  LOOP
    SELECT cp.* INTO profile_rec 
    FROM public.cost_profiles cp
    JOIN public.listings l ON l.cost_profile_id = cp.id
    WHERE l.user_id = order_user_id AND l.sku = row_item.seller_sku;

    IF FOUND THEN
      unit_cost := COALESCE(profile_rec.printing_cost, 0) +
                   COALESCE(profile_rec.material_cost, 0) +
                   COALESCE(profile_rec.packaging_cost, 0) +
                   COALESCE(profile_rec.shipping_cost, 0) +
                   COALESCE(profile_rec.labor_cost, 0) +
                   COALESCE(profile_rec.misc_cost, 0);
      total_cogs := total_cogs + (unit_cost * COALESCE(row_item.quantity_ordered, 1));
    END IF;
  END LOOP;

  -- Deduct total item cogs from gross profit to get net profit
  v_net_profit := COALESCE(v_gross_profit, 0) - total_cogs;
  
  UPDATE public.orders 
  SET net_profit = v_net_profit 
  WHERE id = target_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Trigger on order_items modifications
CREATE OR REPLACE FUNCTION public.on_order_item_modified()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalculate_order_profit(OLD.order_id);
    RETURN OLD;
  ELSE
    PERFORM public.recalculate_order_profit(NEW.order_id);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trig_order_item_modified') THEN
    CREATE TRIGGER trig_order_item_modified
      AFTER INSERT OR UPDATE OR DELETE ON public.order_items
      FOR EACH ROW EXECUTE FUNCTION public.on_order_item_modified();
  END IF;
END $$;

-- 3. Trigger on cost_profiles update
CREATE OR REPLACE FUNCTION public.on_cost_profile_modified()
RETURNS TRIGGER AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT DISTINCT oi.order_id 
    FROM public.order_items oi
    JOIN public.listings l ON l.sku = oi.seller_sku
    WHERE l.cost_profile_id = NEW.id
  LOOP
    PERFORM public.recalculate_order_profit(r.order_id);
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trig_cost_profile_modified') THEN
    CREATE TRIGGER trig_cost_profile_modified
      AFTER UPDATE ON public.cost_profiles
      FOR EACH ROW EXECUTE FUNCTION public.on_cost_profile_modified();
  END IF;
END $$;

-- 4. Trigger on listings updates (when cost profile is linked)
CREATE OR REPLACE FUNCTION public.on_listing_modified()
RETURNS TRIGGER AS $$
DECLARE
  r RECORD;
BEGIN
  IF OLD.cost_profile_id IS DISTINCT FROM NEW.cost_profile_id THEN
    FOR r IN 
      SELECT DISTINCT order_id FROM public.order_items WHERE seller_sku = NEW.sku
    LOOP
      PERFORM public.recalculate_order_profit(r.order_id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trig_listing_modified') THEN
    CREATE TRIGGER trig_listing_modified
      AFTER UPDATE ON public.listings
      FOR EACH ROW EXECUTE FUNCTION public.on_listing_modified();
  END IF;
END $$;

-- 5. Run initial one-time sweep recalculating profits of all existing orders
DO $$
DECLARE
  order_rec RECORD;
BEGIN
  FOR order_rec IN SELECT id FROM public.orders LOOP
    PERFORM public.recalculate_order_profit(order_rec.id);
  END LOOP;
END $$;


-- ==========================================
-- MIGRATION: 20260713_automation_engine.sql
-- ==========================================

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


-- ==========================================
-- MIGRATION: 20260713_create_ai_cache_and_resilience.sql
-- ==========================================

-- PostgreSQL Migration: 20260713_create_ai_cache_and_resilience.sql
-- Description: Creates persistent caching and resilience tracking schemas

-- 1. Create ai_response_cache table
CREATE TABLE IF NOT EXISTS public.ai_response_cache (
  cache_key text PRIMARY KEY,
  response_text text NOT NULL,
  tokens_used integer DEFAULT 0,
  estimated_cost numeric DEFAULT 0.0,
  latency_ms integer DEFAULT 0,
  is_negative boolean DEFAULT false NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for cache lookup pruning
CREATE INDEX IF NOT EXISTS idx_ai_response_cache_expires_at ON public.ai_response_cache(expires_at);

-- Enable RLS
ALTER TABLE public.ai_response_cache ENABLE ROW LEVEL SECURITY;

-- Read permission to all authenticated users
DROP POLICY IF EXISTS "Allow read cache to authenticated users" ON public.ai_response_cache;
CREATE POLICY "Allow read cache to authenticated users" ON public.ai_response_cache
  FOR SELECT USING (auth.role() = 'authenticated');

-- Manage permission to superadmins/system
DROP POLICY IF EXISTS "System can manage cache" ON public.ai_response_cache;
CREATE POLICY "System can manage cache" ON public.ai_response_cache
  FOR ALL USING (true); -- Server-side service role client will bypass, but allow broad writes for auth users too since AI requests are executed in user sessions

-- 2. Create ai_resilience_states table for 3-state circuit breakers
CREATE TABLE IF NOT EXISTS public.ai_resilience_states (
  provider_model text PRIMARY KEY,
  state text DEFAULT 'closed' NOT NULL CHECK (state IN ('closed', 'open', 'half-open')),
  failure_count integer DEFAULT 0 NOT NULL,
  tripped_at timestamp with time zone,
  last_request_at timestamp with time zone,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.ai_resilience_states ENABLE ROW LEVEL SECURITY;

-- Allow authenticated read
DROP POLICY IF EXISTS "Allow read resilience status to authenticated" ON public.ai_resilience_states;
CREATE POLICY "Allow read resilience status to authenticated" ON public.ai_resilience_states
  FOR SELECT USING (auth.role() = 'authenticated');

-- Allow all writes for system execution
DROP POLICY IF EXISTS "System can manage resilience states" ON public.ai_resilience_states;
CREATE POLICY "System can manage resilience states" ON public.ai_resilience_states
  FOR ALL USING (true);


-- ==========================================
-- MIGRATION: 20260713_create_feature_flags.sql
-- ==========================================

-- PostgreSQL Migration: 20260713_create_feature_flags.sql
-- Description: Centralized Feature Flags and Overrides for experimental rollouts

-- 1. Create feature_flags table
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


-- ==========================================
-- MIGRATION: 20260713_create_logs_and_telemetry.sql
-- ==========================================

-- PostgreSQL Migration: 20260713_create_logs_and_telemetry.sql
-- Description: Sets up centralized system logging, telemetry metrics, and expanded heartbeat tracking

-- 1. Create system_logs table
CREATE TABLE IF NOT EXISTS public.system_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  level text NOT NULL CHECK (level IN ('TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL')),
  message text NOT NULL,
  correlation_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index on created_at for fast time-range querying and pruning
CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON public.system_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_system_logs_correlation_id ON public.system_logs(correlation_id);

-- Enable RLS
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

-- Read policies: Authenticated users can view logs
DROP POLICY IF EXISTS "Allow read system_logs to authenticated users" ON public.system_logs;
CREATE POLICY "Allow read system_logs to authenticated users" ON public.system_logs
  FOR SELECT USING (auth.role() = 'authenticated');

-- Write policies: System/service roles can insert
DROP POLICY IF EXISTS "System can manage system_logs" ON public.system_logs;
CREATE POLICY "System can manage system_logs" ON public.system_logs
  FOR ALL USING (true);

-- 2. Create ai_telemetry_metrics table
CREATE TABLE IF NOT EXISTS public.ai_telemetry_metrics (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider_model text NOT NULL,
  request_count integer DEFAULT 1 NOT NULL,
  cache_hits integer DEFAULT 0 NOT NULL,
  cache_misses integer DEFAULT 0 NOT NULL,
  total_latency_ms bigint DEFAULT 0 NOT NULL,
  tokens_used integer DEFAULT 0 NOT NULL,
  estimated_cost numeric DEFAULT 0.0 NOT NULL,
  estimated_savings numeric DEFAULT 0.0 NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for time-series charts
CREATE INDEX IF NOT EXISTS idx_ai_telemetry_metrics_created_at ON public.ai_telemetry_metrics(created_at);

-- Enable RLS
ALTER TABLE public.ai_telemetry_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read telemetry to authenticated users" ON public.ai_telemetry_metrics;
CREATE POLICY "Allow read telemetry to authenticated users" ON public.ai_telemetry_metrics
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "System can manage telemetry" ON public.ai_telemetry_metrics;
CREATE POLICY "System can manage telemetry" ON public.ai_telemetry_metrics
  FOR ALL USING (true);

-- 3. Create heartbeats table (or update if already exists)
CREATE TABLE IF NOT EXISTS public.heartbeats (
  worker_name text PRIMARY KEY,
  last_run_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  last_success_at timestamp with time zone,
  last_failure_at timestamp with time zone,
  consecutive_failures integer DEFAULT 0 NOT NULL,
  avg_duration_ms integer DEFAULT 0 NOT NULL,
  max_duration_ms integer DEFAULT 0 NOT NULL,
  recovery_time_ms integer DEFAULT 0 NOT NULL,
  health_status text DEFAULT 'healthy' NOT NULL CHECK (health_status IN ('healthy', 'unhealthy', 'degraded')),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.heartbeats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read heartbeats to authenticated users" ON public.heartbeats;
CREATE POLICY "Allow read heartbeats to authenticated users" ON public.heartbeats
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "System can manage heartbeats" ON public.heartbeats;
CREATE POLICY "System can manage heartbeats" ON public.heartbeats
  FOR ALL USING (true);


-- ==========================================
-- MIGRATION: 20260713_fix_alert_logs_type_constraint.sql
-- ==========================================

-- SellerPlus OS — Fix alert_logs type constraint
-- Drop the restricted check constraint on alert_logs.type to prevent inserts from crashing.
-- The original table allowed: 'low_stock', 'sales_drop', 'high_refunds', 'profit_decrease', 'out_of_stock_risk'
-- The new profit leak detector inserts: 'high_acos', 'dead_inventory', 'negative_margin', 'missing_cost_profile', 'stockout_risk'

DO $$
DECLARE
    r RECORD;
BEGIN
    -- Locate any check constraint containing column "type" on "alert_logs" table and drop them
    FOR r IN
        SELECT tc.constraint_name 
        FROM information_schema.table_constraints tc 
        JOIN information_schema.constraint_column_usage ccu 
          ON tc.constraint_name = ccu.constraint_name 
         AND tc.table_schema = ccu.table_schema
        WHERE tc.table_name = 'alert_logs' 
          AND ccu.column_name = 'type'
          AND tc.constraint_type = 'CHECK'
    LOOP
        EXECUTE 'ALTER TABLE public.alert_logs DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name);
    END LOOP;
END $$;

-- Verify or add a new, expanded constraint to keep things safe but matching our types
ALTER TABLE public.alert_logs ADD CONSTRAINT alert_logs_type_check 
  CHECK (type IN (
    'low_stock', 'sales_drop', 'high_refunds', 'profit_decrease', 'out_of_stock_risk',
    'high_acos', 'dead_inventory', 'negative_margin', 'missing_cost_profile', 'stockout_risk'
  ));


-- ==========================================
-- MIGRATION: 20260713_fix_order_status_enum.sql
-- ==========================================

-- SellerPlus OS — Fix order status enum constraint
-- The original schema only allowed: 'pending', 'packed', 'shipped', 'delivered', 'returned', 'cancelled'
-- Amazon SP-API returns statuses that need to be mapped. The new internal enum supports:
-- 'pending', 'processing', 'shipped', 'delivered', 'returned', 'cancelled', 'unfulfillable'

-- 1. Drop the old constraint
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;

-- 2. Add the expanded constraint with all valid internal statuses
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check 
  CHECK (status IN ('pending', 'processing', 'shipped', 'delivered', 'returned', 'cancelled', 'unfulfillable'));

-- 3. Migrate any existing rows with old statuses
UPDATE public.orders SET status = 'processing' WHERE status = 'packed';
UPDATE public.orders SET status = 'processing' WHERE status = 'Unshipped';
UPDATE public.orders SET status = 'processing' WHERE status = 'PartiallyShipped';
UPDATE public.orders SET status = 'shipped' WHERE status = 'Shipped';
UPDATE public.orders SET status = 'cancelled' WHERE status IN ('Canceled', 'Cancelled');
UPDATE public.orders SET status = 'pending' WHERE status IN ('Pending', 'PendingAvailability', 'InvoiceUnconfirmed');
UPDATE public.orders SET status = 'unfulfillable' WHERE status = 'Unfulfillable';


-- ==========================================
-- MIGRATION: 20260714_01_ai_memory_and_goals.sql
-- ==========================================

-- 20260714_ai_memory_and_goals.sql
-- Creates the recommendation history table for AI Memory and feedback loops.

CREATE TYPE recommendation_status AS ENUM ('pending', 'accepted', 'rejected', 'ignored', 'auto_executed');

CREATE TABLE public.ai_recommendation_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    recommendation TEXT NOT NULL,
    confidence_score INTEGER NOT NULL,
    evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
    formula TEXT,
    source_tables JSONB NOT NULL DEFAULT '[]'::jsonb,
    ai_reasoning TEXT NOT NULL,
    action_mapping JSONB NOT NULL,
    is_deterministic BOOLEAN NOT NULL DEFAULT false,
    status recommendation_status NOT NULL DEFAULT 'pending',
    context_goal VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    resolved_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.ai_recommendation_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own AI recommendations" 
    ON public.ai_recommendation_history 
    FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own AI recommendations" 
    ON public.ai_recommendation_history 
    FOR UPDATE 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own AI recommendations" 
    ON public.ai_recommendation_history 
    FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can manage all AI recommendations" 
    ON public.ai_recommendation_history 
    USING (true)
    WITH CHECK (true);


-- ==========================================
-- MIGRATION: 20260714_02_phase6_ui_migration.sql
-- ==========================================

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


-- ==========================================
-- MIGRATION: 20260714_03_phase7_bi_jobs.sql
-- ==========================================

-- Phase 7: Background Job Queue for BI Engine
-- A lightweight Postgres-backed job queue. Zero external dependencies.
-- The BI Engine enqueues work here; a cron-worker processes it async.

CREATE TABLE IF NOT EXISTS public.bi_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL DEFAULT 'bi_analysis',
  payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued' 
    CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  result JSONB DEFAULT NULL,
  error TEXT DEFAULT NULL,
  priority INT NOT NULL DEFAULT 5, -- Lower number = higher priority
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NULL,
  completed_at TIMESTAMPTZ DEFAULT NULL
);

-- Enable RLS
ALTER TABLE public.bi_jobs ENABLE ROW LEVEL SECURITY;

-- Users can only see their own jobs
CREATE POLICY "Users can view their own BI jobs"
  ON public.bi_jobs FOR SELECT
  USING (auth.uid() = user_id);

-- Service role manages all jobs (workers use admin client)
CREATE POLICY "Service role manages all BI jobs"
  ON public.bi_jobs FOR ALL
  USING (true);

-- Index: Worker polling — queued jobs ordered by priority + age
CREATE INDEX idx_bi_jobs_status_priority 
  ON public.bi_jobs(status, priority ASC, created_at ASC)
  WHERE status = 'queued';

-- Index: User-facing job status lookup
CREATE INDEX idx_bi_jobs_user_created 
  ON public.bi_jobs(user_id, created_at DESC);

NOTIFY pgrst, 'reload schema';


-- ==========================================
-- MIGRATION: 20260714_04_phase7_db_indexes.sql
-- ==========================================

-- Phase 7: Production Performance — Missing Database Indexes
-- Adds compound indexes on high-cardinality filter columns.
-- These cover the most frequently executed queries in BIRepository,
-- AutomationEngine, and the Realtime recommendation feed.

-- 1. advertising_campaigns: BI aggregation + automation rule evaluation
CREATE INDEX IF NOT EXISTS idx_adcampaigns_user_status 
  ON public.advertising_campaigns(user_id, status);

CREATE INDEX IF NOT EXISTS idx_adcampaigns_user_updated
  ON public.advertising_campaigns(user_id, updated_at DESC);

-- 2. orders: BIRepository 30-day window query
CREATE INDEX IF NOT EXISTS idx_orders_user_purchase_date
  ON public.orders(user_id, purchase_date DESC);

-- 3. ai_recommendation_history: Realtime hook + recommendation center
CREATE INDEX IF NOT EXISTS idx_ai_rec_history_user_created
  ON public.ai_recommendation_history(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_rec_history_lifecycle
  ON public.ai_recommendation_history(user_id, lifecycle);

-- 4. automation_logs: Recommendation center timeline queries
CREATE INDEX IF NOT EXISTS idx_automation_logs_user_created
  ON public.automation_logs(user_id, created_at DESC);

-- 5. alert_logs: Automation rule idempotency checks (used in restock rule)
CREATE INDEX IF NOT EXISTS idx_alert_logs_user_type_read
  ON public.alert_logs(user_id, type, is_read);

-- 6. ai_response_cache: TTL-based expiry pruning 
-- (Already created in 20260713, adding composite to improve lookup)
CREATE INDEX IF NOT EXISTS idx_ai_response_cache_key_expires
  ON public.ai_response_cache(cache_key, expires_at);

-- 7. feature_flags: Per-key lookups (called multiple times per request)
CREATE INDEX IF NOT EXISTS idx_feature_flags_key
  ON public.feature_flags(key);

CREATE INDEX IF NOT EXISTS idx_feature_flag_overrides_flag_user
  ON public.feature_flag_overrides(flag_key, user_id);

-- 8. listings: Automation rule cost profile scan
CREATE INDEX IF NOT EXISTS idx_listings_user_cost_profile
  ON public.listings(user_id, cost_profile_id);

NOTIFY pgrst, 'reload schema';


-- ==========================================
-- MIGRATION: 20260714_05_phase7_remove_anon_policies.sql
-- ==========================================

-- Phase 7: Production Security — Remove Anonymous RLS Policies
-- These policies were added for local development and MUST NOT exist in production.
-- They allow unauthenticated users to read/write sensitive business data.

-- Drop anonymous testing policies from advertising_campaigns
DROP POLICY IF EXISTS "Allow anonymous local testing for campaigns" ON public.advertising_campaigns;

-- Drop anonymous testing policies from refunds
DROP POLICY IF EXISTS "Allow anonymous local testing for refunds" ON public.refunds;

-- Drop anonymous testing policies from listing_alerts
DROP POLICY IF EXISTS "Allow anonymous local testing for listing alerts" ON public.listing_alerts;

-- Drop anonymous testing policies from llm_settings (contains API keys)
DROP POLICY IF EXISTS "Allow anonymous local testing for LLM settings" ON public.llm_settings;

-- Verify no other anonymous policies exist on sensitive tables
-- (Run this manually to audit): 
-- SELECT schemaname, tablename, policyname, qual 
-- FROM pg_policies 
-- WHERE qual LIKE '%anon%' AND schemaname = 'public';

NOTIFY pgrst, 'reload schema';


-- ==========================================
-- MIGRATION: 20260716_warehouse_and_workers.sql
-- ==========================================

-- ===================================================================
-- SellerPlus OS — Phase 9: Warehouse Operations & AI Scheduling
-- Migration: 20260716_warehouse_and_workers.sql
-- ===================================================================

-- ─── 1. Extend profiles role constraint ──────────────────────────────
-- Drop the old constraint and redefine it to include warehouse roles.
-- Existing data (owner, admin, manager, analyst, employee, read-only)
-- continues to be valid — this is purely additive.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_role_check' AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check;
  END IF;
END $$;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'owner', 'admin', 'manager', 'analyst', 'employee', 'read-only',
    'warehouse', 'packer', 'shipping'
  ));

-- ─── 2. Extend orders table ───────────────────────────────────────────
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_method TEXT DEFAULT 'Standard';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS packing_notes TEXT;

-- ─── 3. Extend listings table ─────────────────────────────────────────
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS infographic_concepts TEXT[] DEFAULT '{}'::text[];
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS ai_image_prompts     TEXT[] DEFAULT '{}'::text[];
-- Revision tracking for draft listing versioning
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS draft_revision    INT     DEFAULT 0;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS draft_history     JSONB   DEFAULT '[]'::jsonb;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS published_at      TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS published_by      UUID    REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ─── 4. Warehouse order audit log ────────────────────────────────────
-- Immutable append-only ledger of every order status transition.
-- Never delete rows from this table.
CREATE TABLE IF NOT EXISTS public.warehouse_audit_log (
  id               UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id         UUID         NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id          UUID         NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  previous_status  TEXT         NOT NULL,
  new_status       TEXT         NOT NULL,
  note             TEXT,
  created_at       TIMESTAMPTZ  DEFAULT now() NOT NULL
);

ALTER TABLE public.warehouse_audit_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'warehouse_audit_log'
      AND policyname = 'Users can view their own warehouse audit logs'
  ) THEN
    CREATE POLICY "Users can view their own warehouse audit logs"
      ON public.warehouse_audit_log FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.orders o
          WHERE o.id = order_id AND o.user_id = auth.uid()
        )
      );
  END IF;

  -- Service role writes on behalf of all users via admin client
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'warehouse_audit_log'
      AND policyname = 'Service role manages warehouse audit log'
  ) THEN
    CREATE POLICY "Service role manages warehouse audit log"
      ON public.warehouse_audit_log FOR ALL
      USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_warehouse_audit_order_id  ON public.warehouse_audit_log(order_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_audit_created   ON public.warehouse_audit_log(created_at DESC);

-- ─── 5. AI Schedules — schedule configuration store ──────────────────
-- Stores only the schedule definition. Execution is always via bi_jobs.
CREATE TABLE IF NOT EXISTS public.ai_schedules (
  id             UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID         NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title          TEXT         NOT NULL,
  task_type      TEXT         NOT NULL,  -- matches JobRegistry keys
  cron_schedule  TEXT         NOT NULL,  -- standard 5-field cron: '0 */6 * * *'
  status         TEXT         NOT NULL   DEFAULT 'active'
                              CHECK (status IN ('active', 'paused')),
  last_run       TIMESTAMPTZ,
  next_run       TIMESTAMPTZ  NOT NULL,
  created_at     TIMESTAMPTZ  DEFAULT now() NOT NULL,
  UNIQUE (user_id, task_type)
);

ALTER TABLE public.ai_schedules ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_schedules'
      AND policyname = 'Users own their schedules'
  ) THEN
    CREATE POLICY "Users own their schedules"
      ON public.ai_schedules FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_schedules'
      AND policyname = 'Service role manages schedules'
  ) THEN
    CREATE POLICY "Service role manages schedules"
      ON public.ai_schedules FOR ALL
      USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ai_schedules_next_run
  ON public.ai_schedules(next_run ASC, status)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_ai_schedules_user_id ON public.ai_schedules(user_id);

-- ─── 6. Notify PostgREST to reload schema ────────────────────────────
NOTIFY pgrst, 'reload schema';


-- ==========================================
-- MIGRATION: 20260717_define_exec_sql.sql
-- ==========================================

-- ===================================================================
-- SellerPlus OS — Phase 9 Production Gap Analysis Fixes
-- Migration: 20260717_define_exec_sql.sql
-- ===================================================================

-- ─── Define exec_sql utility function ──────────────────────────────
-- Required by AI Chat assistant and database migration APIs.
-- Marked as SECURITY DEFINER to execute arbitrary SELECT queries on behalf
-- of authenticated users (the query parser enforces the tenant isolation).
CREATE OR REPLACE FUNCTION public.exec_sql(sql text)
RETURNS jsonb AS $$
DECLARE
  result jsonb;
BEGIN
  -- Strict safety checks should still be performed at the API layer.
  -- Wraps query execution to format output as aggregated JSONB.
  EXECUTE 'SELECT coalesce(json_agg(t)::jsonb, ''[]''::jsonb) FROM (' || sql || ') t' INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';


-- ==========================================
-- MIGRATION: 20260717_fix_exec_sql_security.sql
-- ==========================================

-- ===================================================================
-- SellerPlus OS — Phase 10.5: Security Hardening
-- Migration: 20260717_fix_exec_sql_security.sql
-- ===================================================================

-- ─── Fix exec_sql security context ─────────────────────────────────
-- The previous definition used SECURITY DEFINER, which bypassed RLS
-- when executing AI-generated queries. To fix this securely while supporting
-- backend service roles, we explicitly drop privileges to the `authenticated` role
-- and set the request.jwt.claim.sub context so RLS policies are rigorously enforced.

CREATE OR REPLACE FUNCTION public.exec_sql(sql text, active_user_id uuid)
RETURNS jsonb AS $$
DECLARE
  result jsonb;
BEGIN
  -- Explicitly assume the standard user role to enforce Row Level Security
  SET LOCAL ROLE authenticated;
  
  -- Inject the provided user ID into the auth.uid() context for RLS evaluation
  PERFORM set_config('request.jwt.claim.sub', active_user_id::text, true);

  -- Execute the raw query under strict RLS isolation
  EXECUTE 'SELECT coalesce(json_agg(t)::jsonb, ''[]''::jsonb) FROM (' || sql || ') t' INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';


-- ==========================================
-- MIGRATION: 20260717_p1_indexes.sql
-- ==========================================

-- ===================================================================
-- SellerPlus OS — Phase 9.5: P1 Performance Indexes
-- Migration: 20260717_p1_indexes.sql
-- ===================================================================
-- Confirmed missing from 20260714_phase7_db_indexes.sql:
--   1. order_items(seller_sku) — analytics joins, product performance queries
--   2. orders(user_id, status) — status-count aggregations in BIRepository
--
-- All are safe additive-only changes using CREATE INDEX IF NOT EXISTS.
-- ===================================================================

-- 1. order_items: product-level analytics joins on seller_sku
--    Used by BIRepository SKU-level aggregations and ProfitLeakDetector
CREATE INDEX IF NOT EXISTS idx_order_items_seller_sku
  ON public.order_items(seller_sku);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id
  ON public.order_items(order_id);

-- 2. orders: status-count aggregations (Pending/Packed/Shipped dashboard KPIs)
--    Used by warehouse portal and order page counts
CREATE INDEX IF NOT EXISTS idx_orders_user_status
  ON public.orders(user_id, status);

-- 3. bi_jobs: queue drain queries — status + created_at polling on every worker tick
--    Used by bi-processor on every cron tick
CREATE INDEX IF NOT EXISTS idx_bi_jobs_status_created
  ON public.bi_jobs(status, created_at ASC);

-- 4. ai_schedules: next-due schedule polling in task-scheduler
--    Used by task-scheduler cron worker
CREATE INDEX IF NOT EXISTS idx_ai_schedules_user_enabled_next
  ON public.ai_schedules(user_id, status, next_run ASC);

NOTIFY pgrst, 'reload schema';



