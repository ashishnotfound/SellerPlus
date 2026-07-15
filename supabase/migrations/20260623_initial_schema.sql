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
