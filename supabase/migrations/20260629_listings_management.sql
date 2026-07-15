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
