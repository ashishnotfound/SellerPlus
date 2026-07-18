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

-- Add is_read column idempotently in case table already existed without it
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'alert_logs' and column_name = 'is_read'
  ) then
    alter table public.alert_logs add column is_read boolean default false not null;
  end if;
end $$;

alter table public.alert_logs enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='alert_logs' and policyname='Users can manage their own alert logs') then
    create policy "Users can manage their own alert logs" on public.alert_logs for all using (auth.uid() = user_id);
  end if;
end $$;
create index if not exists idx_alert_logs_user_read on public.alert_logs(user_id, is_read);
