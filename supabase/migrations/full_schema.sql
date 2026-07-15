-- CONSOLIDATED SELLERPLUS DATABASE SCHEMA
-- Generated on: 2026-07-09T12:11:57.373Z

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
-- POST-MIGRATION GRANTS & CACHE RELOAD
-- ==========================================


GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO postgres, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
