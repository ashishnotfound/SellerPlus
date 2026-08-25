-- Reyo Pack fulfillment foundation
--
-- Extends SellerPlus orders and shipments with package-level packing state,
-- immutable operational history, resumable sessions, putaway locations, and
-- durable Amazon synchronization progress. All mutations are performed by
-- service-role-only functions after the application authorizes the actor.

begin;

-- Amazon remains the source of truth for order state. Reyo Pack records its
-- own package workflow alongside that source state instead of overwriting it.
alter table public.orders
  add column if not exists ship_by_date timestamptz,
  add column if not exists shipping_service_level text,
  add column if not exists cancellation_status text not null default 'NOT_CANCELLED',
  add column if not exists cancellation_reason text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists last_amazon_synced_at timestamptz;

update public.orders
set cancellation_status = 'CANCELLED',
    cancelled_at = coalesce(cancelled_at, source_updated_at, last_update_date, updated_at, now())
where lower(status) in ('canceled', 'cancelled', 'unfulfillable');

alter table public.orders
  drop constraint if exists orders_cancellation_status_check;
alter table public.orders
  add constraint orders_cancellation_status_check
  check (cancellation_status in ('NOT_CANCELLED', 'CANCELLED'));

alter table public.order_items
  add column if not exists quantity_packed integer not null default 0,
  add column if not exists updated_at timestamptz not null default now();

update public.order_items
set quantity_packed = greatest(0, least(quantity_packed, coalesce(quantity_ordered, 0)));

alter table public.order_items
  drop constraint if exists order_items_quantity_packed_check;
alter table public.order_items
  add constraint order_items_quantity_packed_check
  check (quantity_packed >= 0 and quantity_packed <= coalesce(quantity_ordered, 0));

alter table public.order_items
  add column if not exists quantity_remaining integer
  generated always as (greatest(coalesce(quantity_ordered, 0) - quantity_packed, 0)) stored;

-- Sessions are resumable. A partial unique index prevents a worker from
-- accidentally opening two authoritative sessions in the same operating mode.
create table if not exists public.reyo_pack_sessions (
  id uuid primary key default gen_random_uuid(),
  session_number bigint generated always as identity,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  mode text not null check (mode in ('PACKING', 'PUTAWAY')),
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'COMPLETED', 'ABANDONED')),
  started_by uuid not null references public.profiles(id) on delete restrict,
  ended_by uuid references public.profiles(id) on delete set null,
  client_session_id uuid not null,
  device_label text,
  packages_packed integer not null default 0 check (packages_packed >= 0),
  units_packed integer not null default 0 check (units_packed >= 0),
  cancelled_scans integer not null default 0 check (cancelled_scans >= 0),
  invalid_scans integer not null default 0 check (invalid_scans >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  putaway_actions integer not null default 0 check (putaway_actions >= 0),
  putaway_units integer not null default 0 check (putaway_units >= 0),
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, client_session_id),
  check (ended_at is null or ended_at >= started_at)
);

create unique index if not exists uq_reyo_pack_active_actor_mode
  on public.reyo_pack_sessions(workspace_id, started_by, mode)
  where status = 'ACTIVE';
create unique index if not exists uq_reyo_pack_workspace_session_number
  on public.reyo_pack_sessions(workspace_id, session_number);
create unique index if not exists uq_reyo_pack_sessions_id_workspace
  on public.reyo_pack_sessions(id, workspace_id);
create index if not exists idx_reyo_pack_sessions_workspace_status_started
  on public.reyo_pack_sessions(workspace_id, status, started_at desc);
create index if not exists idx_reyo_pack_sessions_actor_status
  on public.reyo_pack_sessions(workspace_id, started_by, status, last_activity_at desc);

-- SKU metadata is source-qualified. Optional display fields such as size are
-- nullable because the Orders API does not guarantee that Amazon supplies them.
create table if not exists public.reyo_pack_skus (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  marketplace_account_id uuid references public.marketplace_accounts(id) on delete set null,
  sku text not null check (char_length(trim(sku)) between 1 and 200),
  sku_normalized text generated always as (upper(trim(sku))) stored,
  asin text,
  product_title text,
  size_label text,
  source text not null default 'SELLER_ENTERED'
    check (source in ('SELLER_ENTERED', 'AMAZON_ORDERS', 'AMAZON_CATALOG', 'IMPORT')),
  source_updated_at timestamptz,
  active boolean not null default true,
  version bigint not null default 1,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_reyo_pack_skus_account_sku
  on public.reyo_pack_skus(workspace_id, marketplace_account_id, sku_normalized)
  where marketplace_account_id is not null;
create unique index if not exists uq_reyo_pack_skus_manual_sku
  on public.reyo_pack_skus(workspace_id, sku_normalized)
  where marketplace_account_id is null;
create index if not exists idx_reyo_pack_skus_workspace_title
  on public.reyo_pack_skus(workspace_id, lower(product_title));
create unique index if not exists uq_reyo_pack_skus_id_workspace
  on public.reyo_pack_skus(id, workspace_id);

alter table public.order_items
  add column if not exists reyo_pack_sku_id uuid references public.reyo_pack_skus(id) on delete set null;

-- Existing shipment rows are retained. Carrier and source status may be absent
-- before Amazon assigns a carrier, so those legacy columns cannot be required.
alter table public.shipments alter column carrier drop not null;
alter table public.shipments alter column status drop not null;
alter table public.shipments
  add column if not exists marketplace_account_id uuid references public.marketplace_accounts(id) on delete set null,
  add column if not exists amazon_shipment_id text,
  add column if not exists packing_status text not null default 'UNPACKED',
  add column if not exists packing_claimed_by uuid references public.profiles(id) on delete set null,
  add column if not exists packing_session_id uuid references public.reyo_pack_sessions(id) on delete set null,
  add column if not exists packing_claimed_at timestamptz,
  add column if not exists packing_claim_expires_at timestamptz,
  add column if not exists packed_at timestamptz,
  add column if not exists packed_by uuid references public.profiles(id) on delete set null,
  add column if not exists source_updated_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.shipments
  drop constraint if exists shipments_packing_status_check;
alter table public.shipments
  add constraint shipments_packing_status_check
  check (packing_status in ('UNPACKED', 'PACKING', 'PACKED', 'CANCELLED', 'ERROR'));
alter table public.shipments
  drop constraint if exists shipments_claim_shape_check;
alter table public.shipments
  add constraint shipments_claim_shape_check check (
    (packing_status = 'PACKING'
      and packing_claimed_by is not null
      and packing_session_id is not null
      and packing_claimed_at is not null
      and packing_claim_expires_at is not null)
    or
    (packing_status <> 'PACKING'
      and packing_claimed_by is null
      and packing_session_id is null
      and packing_claimed_at is null
      and packing_claim_expires_at is null)
  ) not valid;

alter table public.shipments
  add column if not exists awb_normalized text
  generated always as (regexp_replace(upper(coalesce(awb_code, '')), '[^A-Z0-9]', '', 'g')) stored;

create unique index if not exists uq_shipments_workspace_account_awb
  on public.shipments(workspace_id, marketplace_account_id, awb_normalized)
  where marketplace_account_id is not null and awb_normalized <> '';
create unique index if not exists uq_shipments_workspace_manual_awb
  on public.shipments(workspace_id, awb_normalized)
  where marketplace_account_id is null and awb_normalized <> '';
create unique index if not exists uq_shipments_workspace_account_amazon_id
  on public.shipments(workspace_id, marketplace_account_id, amazon_shipment_id)
  where marketplace_account_id is not null and amazon_shipment_id is not null;
create index if not exists idx_shipments_workspace_packing_updated
  on public.shipments(workspace_id, packing_status, updated_at desc);
create index if not exists idx_shipments_workspace_order
  on public.shipments(workspace_id, order_id);
create index if not exists idx_shipments_workspace_tracking
  on public.shipments(workspace_id, tracking_number)
  where tracking_number is not null;

create unique index if not exists uq_orders_id_workspace on public.orders(id, workspace_id);
create unique index if not exists uq_order_items_id_workspace on public.order_items(id, workspace_id);
create unique index if not exists uq_shipments_id_workspace on public.shipments(id, workspace_id);

-- Label references and storage paths are intentionally service-only. The API
-- authorizes a request and returns a short-lived response; Realtime and normal
-- table reads never expose permanent document locations.
create table if not exists public.reyo_pack_label_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  shipment_id uuid not null,
  external_document_reference text,
  storage_bucket text,
  storage_path text,
  content_type text,
  document_source text not null
    check (document_source in ('AMAZON_EASY_SHIP', 'AMAZON_SHIPPING', 'SELLER_UPLOAD', 'LEGACY')),
  external_expires_at timestamptz,
  fetched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (shipment_id, workspace_id)
    references public.shipments(id, workspace_id) on delete cascade,
  check (external_document_reference is not null or storage_path is not null),
  unique (workspace_id, shipment_id)
);

create index if not exists idx_reyo_pack_labels_workspace_shipment
  on public.reyo_pack_label_documents(workspace_id, shipment_id);

insert into public.reyo_pack_label_documents (
  workspace_id, shipment_id, external_document_reference, document_source, created_at, updated_at
)
select shipment.workspace_id, shipment.id, shipment.label_url, 'LEGACY',
       shipment.created_at, now()
from public.shipments shipment
where shipment.label_url is not null
  and shipment.workspace_id is not null
on conflict (workspace_id, shipment_id) do nothing;

update public.shipments set label_url = null where label_url is not null;

-- Shipment-item allocation is explicit so multi-package orders cannot cause all
-- order quantities to be marked packed when only one label was scanned.
create table if not exists public.reyo_pack_shipment_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  order_id uuid not null,
  shipment_id uuid not null,
  order_item_id uuid not null,
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (order_id, workspace_id)
    references public.orders(id, workspace_id) on delete cascade,
  foreign key (shipment_id, workspace_id)
    references public.shipments(id, workspace_id) on delete cascade,
  foreign key (order_item_id, workspace_id)
    references public.order_items(id, workspace_id) on delete cascade,
  unique (workspace_id, shipment_id, order_item_id)
);

create index if not exists idx_reyo_pack_shipment_items_order
  on public.reyo_pack_shipment_items(workspace_id, order_id, shipment_id);
create index if not exists idx_reyo_pack_shipment_items_item
  on public.reyo_pack_shipment_items(workspace_id, order_item_id);

-- Packing events are append-only. A package transition is distinct from its
-- item detail rows so the database can enforce exactly one authoritative pack.
create table if not exists public.reyo_pack_packing_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  order_id uuid,
  shipment_id uuid,
  session_id uuid,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in (
    'BARCODE_UNKNOWN', 'CLAIMED', 'CLAIM_RELEASED', 'ALREADY_PACKED',
    'CANCELLED_DETECTED', 'PACK_CONFIRMED', 'PACK_ITEM',
    'PACK_CORRECTED', 'ERROR'
  )),
  awb text,
  sku text,
  quantity integer not null default 0 check (quantity >= 0),
  previous_status text,
  new_status text,
  idempotency_key text,
  reason text,
  metadata jsonb not null default '{}',
  correlation_id text,
  created_at timestamptz not null default now(),
  foreign key (order_id, workspace_id)
    references public.orders(id, workspace_id) on delete restrict,
  foreign key (shipment_id, workspace_id)
    references public.shipments(id, workspace_id) on delete restrict,
  foreign key (session_id, workspace_id)
    references public.reyo_pack_sessions(id, workspace_id) on delete restrict,
  check (
    event_type not in ('CLAIMED', 'PACK_CONFIRMED', 'PACK_ITEM')
    or session_id is not null
  ),
  check (
    previous_status is null
    or previous_status in ('UNPACKED', 'PACKING', 'PACKED', 'CANCELLED', 'ERROR')
  ),
  check (
    new_status is null
    or new_status in ('UNPACKED', 'PACKING', 'PACKED', 'CANCELLED', 'ERROR')
  )
);

create unique index if not exists uq_reyo_pack_packing_idempotency
  on public.reyo_pack_packing_events(workspace_id, idempotency_key)
  where idempotency_key is not null;
create unique index if not exists uq_reyo_pack_single_pack_transition
  on public.reyo_pack_packing_events(workspace_id, shipment_id)
  where event_type = 'PACK_CONFIRMED';
create index if not exists idx_reyo_pack_events_workspace_created
  on public.reyo_pack_packing_events(workspace_id, created_at desc);
create index if not exists idx_reyo_pack_events_workspace_order_created
  on public.reyo_pack_packing_events(workspace_id, order_id, created_at desc);
create index if not exists idx_reyo_pack_events_workspace_awb_created
  on public.reyo_pack_packing_events(workspace_id, awb, created_at desc);
create index if not exists idx_reyo_pack_events_workspace_sku_created
  on public.reyo_pack_packing_events(workspace_id, sku, created_at desc);
create index if not exists idx_reyo_pack_events_workspace_session_created
  on public.reyo_pack_packing_events(workspace_id, session_id, created_at desc);

-- Physical location hierarchy and source-of-truth SKU assignments.
create table if not exists public.reyo_pack_locations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  warehouse_id uuid references public.warehouses(id) on delete set null,
  parent_id uuid,
  location_type text not null check (location_type in ('WAREHOUSE', 'RACK', 'SHELF', 'BIN')),
  code text not null check (char_length(trim(code)) between 1 and 80),
  code_normalized text generated always as (upper(trim(code))) stored,
  name text not null check (char_length(trim(name)) between 1 and 200),
  sort_order integer not null default 0,
  active boolean not null default true,
  version bigint not null default 1,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, code_normalized),
  unique (id, workspace_id),
  foreign key (parent_id, workspace_id)
    references public.reyo_pack_locations(id, workspace_id) on delete restrict
);

create index if not exists idx_reyo_pack_locations_workspace_parent
  on public.reyo_pack_locations(workspace_id, parent_id, sort_order, name);
create index if not exists idx_reyo_pack_locations_workspace_active_code
  on public.reyo_pack_locations(workspace_id, code_normalized)
  where active = true;

create table if not exists public.reyo_pack_sku_barcodes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sku_id uuid not null,
  barcode text not null check (char_length(trim(barcode)) between 1 and 200),
  barcode_normalized text generated always as
    (regexp_replace(upper(trim(barcode)), '[^A-Z0-9]', '', 'g')) stored,
  barcode_type text not null default 'OTHER'
    check (barcode_type in ('EAN_8', 'EAN_13', 'UPC_A', 'UPC_E', 'CODE_39', 'CODE_128', 'ITF', 'OTHER')),
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (sku_id, workspace_id)
    references public.reyo_pack_skus(id, workspace_id) on delete cascade,
  unique (workspace_id, barcode_normalized)
);

create index if not exists idx_reyo_pack_barcodes_sku
  on public.reyo_pack_sku_barcodes(workspace_id, sku_id)
  where active = true;

create table if not exists public.reyo_pack_sku_locations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sku_id uuid not null,
  location_id uuid not null,
  expected_quantity integer check (expected_quantity is null or expected_quantity >= 0),
  version bigint not null default 1,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (sku_id, workspace_id)
    references public.reyo_pack_skus(id, workspace_id) on delete restrict,
  foreign key (location_id, workspace_id)
    references public.reyo_pack_locations(id, workspace_id) on delete restrict,
  unique (workspace_id, sku_id)
);

create index if not exists idx_reyo_pack_sku_locations_location
  on public.reyo_pack_sku_locations(workspace_id, location_id, updated_at desc);

create table if not exists public.reyo_pack_putaway_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sku_id uuid not null,
  previous_location_id uuid,
  new_location_id uuid not null,
  session_id uuid,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in ('ASSIGNED', 'MOVED', 'CONFIRMED')),
  quantity integer check (quantity is null or quantity >= 0),
  reason text,
  idempotency_key text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  foreign key (sku_id, workspace_id)
    references public.reyo_pack_skus(id, workspace_id) on delete restrict,
  foreign key (previous_location_id, workspace_id)
    references public.reyo_pack_locations(id, workspace_id) on delete restrict,
  foreign key (new_location_id, workspace_id)
    references public.reyo_pack_locations(id, workspace_id) on delete restrict,
  foreign key (session_id, workspace_id)
    references public.reyo_pack_sessions(id, workspace_id) on delete restrict
);

create unique index if not exists uq_reyo_pack_putaway_idempotency
  on public.reyo_pack_putaway_events(workspace_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists idx_reyo_pack_putaway_workspace_sku_created
  on public.reyo_pack_putaway_events(workspace_id, sku_id, created_at desc);
create index if not exists idx_reyo_pack_putaway_workspace_location_created
  on public.reyo_pack_putaway_events(workspace_id, new_location_id, created_at desc);
create index if not exists idx_reyo_pack_putaway_workspace_session_created
  on public.reyo_pack_putaway_events(workspace_id, session_id, created_at desc);

create table if not exists public.reyo_pack_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  sound_enabled boolean not null default true,
  vibration_enabled boolean not null default true,
  scan_debounce_ms integer not null default 1500 check (scan_debounce_ms between 250 and 10000),
  claim_ttl_seconds integer not null default 120 check (claim_ttl_seconds between 30 and 600),
  sync_interval_minutes integer not null default 15 check (sync_interval_minutes between 5 and 1440),
  allow_manual_awb boolean not null default true,
  version bigint not null default 1,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.reyo_pack_sync_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  marketplace_account_id uuid not null references public.marketplace_accounts(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  sync_type text not null check (sync_type in ('INCREMENTAL', 'FULL', 'ORDERS', 'SHIPPING')),
  status text not null default 'QUEUED'
    check (status in ('QUEUED', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED')),
  orders_scanned integer not null default 0 check (orders_scanned >= 0),
  orders_new integer not null default 0 check (orders_new >= 0),
  orders_updated integer not null default 0 check (orders_updated >= 0),
  orders_cancelled integer not null default 0 check (orders_cancelled >= 0),
  shipments_updated integer not null default 0 check (shipments_updated >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  progress_message text,
  last_error_code text,
  last_error_message text,
  correlation_id text,
  requested_by uuid references public.profiles(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (completed_at is null or started_at is null or completed_at >= started_at)
);

create index if not exists idx_reyo_pack_sync_workspace_created
  on public.reyo_pack_sync_runs(workspace_id, created_at desc);
create index if not exists idx_reyo_pack_sync_account_status_created
  on public.reyo_pack_sync_runs(workspace_id, marketplace_account_id, status, created_at desc);
create unique index if not exists uq_reyo_pack_sync_active_job
  on public.reyo_pack_sync_runs(workspace_id, job_id)
  where job_id is not null;

-- Operational event rows are immutable even to code using the service role.
create or replace function private.reject_reyo_pack_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '55000', message = 'Reyo Pack history is append-only.';
end;
$$;

create or replace function private.validate_reyo_pack_shipment_item()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  shipment_order_id uuid;
  shipment_state text;
  item_order_id uuid;
  ordered_quantity integer;
  allocated_quantity integer;
begin
  if tg_op = 'DELETE' then
    select packing_status into shipment_state
    from public.shipments
    where workspace_id = old.workspace_id and id = old.shipment_id;
    if shipment_state in ('PACKED', 'CANCELLED') then
      raise exception using errcode = '55000', message = 'Terminal shipment allocation history cannot be changed.';
    end if;
    return old;
  end if;

  select order_id, packing_status into shipment_order_id, shipment_state
  from public.shipments
  where workspace_id = new.workspace_id and id = new.shipment_id;
  select order_id, quantity_ordered into item_order_id, ordered_quantity
  from public.order_items
  where workspace_id = new.workspace_id and id = new.order_item_id;

  if shipment_order_id is null or item_order_id is null
     or shipment_order_id <> new.order_id or item_order_id <> new.order_id then
    raise exception using errcode = '23514', message = 'Shipment allocation order mismatch.';
  end if;
  if shipment_state in ('PACKED', 'CANCELLED') then
    raise exception using errcode = '55000', message = 'Terminal shipment allocation history cannot be changed.';
  end if;

  select coalesce(sum(allocation.quantity), 0) into allocated_quantity
  from public.reyo_pack_shipment_items allocation
  where allocation.workspace_id = new.workspace_id
    and allocation.order_item_id = new.order_item_id
    and (tg_op = 'INSERT' or allocation.id <> new.id);

  if allocated_quantity + new.quantity > coalesce(ordered_quantity, 0) then
    raise exception using errcode = '23514', message = 'Shipment allocations exceed the ordered quantity.';
  end if;
  return new;
end;
$$;

drop trigger if exists reyo_pack_shipment_item_validate on public.reyo_pack_shipment_items;
create trigger reyo_pack_shipment_item_validate
before insert or update or delete on public.reyo_pack_shipment_items
for each row execute function private.validate_reyo_pack_shipment_item();

drop trigger if exists reyo_pack_packing_events_immutable on public.reyo_pack_packing_events;
create trigger reyo_pack_packing_events_immutable
before update or delete on public.reyo_pack_packing_events
for each row execute function private.reject_reyo_pack_event_mutation();

drop trigger if exists reyo_pack_putaway_events_immutable on public.reyo_pack_putaway_events;
create trigger reyo_pack_putaway_events_immutable
before update or delete on public.reyo_pack_putaway_events
for each row execute function private.reject_reyo_pack_event_mutation();

create or replace function private.normalize_reyo_pack_barcode(raw_barcode text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select regexp_replace(upper(trim(raw_barcode)), '[^A-Z0-9]', '', 'g');
$$;

insert into public.reyo_pack_packing_events (
  workspace_id, order_id, shipment_id, event_type, awb,
  previous_status, new_status, idempotency_key, reason, metadata, created_at
)
select shipment.workspace_id, shipment.order_id, shipment.id,
       'CANCELLED_DETECTED', shipment.awb_code, shipment.packing_status,
       'CANCELLED', 'migration:cancel:' || shipment.id::text,
       parent_order.cancellation_reason,
       jsonb_build_object('source', 'legacy_order_state'),
       coalesce(parent_order.cancelled_at, parent_order.updated_at, now())
from public.shipments shipment
join public.orders parent_order
  on parent_order.workspace_id = shipment.workspace_id
 and parent_order.id = shipment.order_id
where parent_order.cancellation_status = 'CANCELLED'
  and shipment.packing_status <> 'CANCELLED'
on conflict (workspace_id, idempotency_key) where idempotency_key is not null do nothing;

update public.shipments shipment
set packing_status = 'CANCELLED',
    packing_claimed_by = null,
    packing_session_id = null,
    packing_claimed_at = null,
    packing_claim_expires_at = null,
    updated_at = now()
from public.orders parent_order
where parent_order.workspace_id = shipment.workspace_id
  and parent_order.id = shipment.order_id
  and parent_order.cancellation_status = 'CANCELLED'
  and shipment.packing_status <> 'CANCELLED';

create or replace function public.start_reyo_pack_session(
  p_workspace_id uuid,
  p_actor_id uuid,
  p_mode text,
  p_client_session_id uuid,
  p_device_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_session public.reyo_pack_sessions%rowtype;
begin
  if p_mode not in ('PACKING', 'PUTAWAY') then
    raise exception using errcode = '22023', message = 'Unsupported Reyo Pack session mode.';
  end if;
  if char_length(coalesce(p_device_label, '')) > 160 then
    raise exception using errcode = '22023', message = 'Device label exceeds 160 characters.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_workspace_id::text || ':' || p_actor_id::text || ':' || p_mode, 0)
  );

  select * into active_session
  from public.reyo_pack_sessions
  where workspace_id = p_workspace_id
    and started_by = p_actor_id
    and mode = p_mode
    and status = 'ACTIVE'
  for update;

  if found then
    update public.reyo_pack_sessions
    set last_activity_at = now(), updated_at = now()
    where id = active_session.id;
    return jsonb_build_object(
      'outcome', 'RESUMED',
      'sessionId', active_session.id,
      'sessionNumber', active_session.session_number,
      'mode', active_session.mode,
      'startedAt', active_session.started_at
    );
  end if;

  insert into public.reyo_pack_sessions (
    workspace_id, mode, started_by, client_session_id, device_label
  ) values (
    p_workspace_id, p_mode, p_actor_id, p_client_session_id,
    nullif(trim(coalesce(p_device_label, '')), '')
  ) returning * into active_session;

  insert into public.audit_events (
    workspace_id, actor_type, actor_id, action, resource_type, resource_id,
    new_state, source
  ) values (
    p_workspace_id, 'human', p_actor_id, 'reyo_pack.session_started',
    'reyo_pack_session', active_session.id::text,
    jsonb_build_object('mode', p_mode, 'sessionNumber', active_session.session_number),
    'reyo_pack_api'
  );

  return jsonb_build_object(
    'outcome', 'STARTED',
    'sessionId', active_session.id,
    'sessionNumber', active_session.session_number,
    'mode', active_session.mode,
    'startedAt', active_session.started_at
  );
end;
$$;

create or replace function public.end_reyo_pack_session(
  p_workspace_id uuid,
  p_actor_id uuid,
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_session public.reyo_pack_sessions%rowtype;
  completed_session public.reyo_pack_sessions%rowtype;
begin
  select * into target_session
  from public.reyo_pack_sessions
  where workspace_id = p_workspace_id and id = p_session_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Packing session not found.';
  end if;

  if target_session.status <> 'ACTIVE' then
    return jsonb_build_object(
      'outcome', target_session.status,
      'sessionId', target_session.id,
      'sessionNumber', target_session.session_number,
      'packagesPacked', target_session.packages_packed,
      'unitsPacked', target_session.units_packed,
      'cancelledScans', target_session.cancelled_scans,
      'invalidScans', target_session.invalid_scans,
      'errors', target_session.error_count,
      'startedAt', target_session.started_at,
      'endedAt', target_session.ended_at
    );
  end if;

  insert into public.reyo_pack_packing_events (
    workspace_id, order_id, shipment_id, session_id, actor_id, event_type,
    awb, previous_status, new_status, reason
  )
  select shipment.workspace_id, shipment.order_id, shipment.id,
         target_session.id, p_actor_id, 'CLAIM_RELEASED', shipment.awb_code,
         'PACKING', 'UNPACKED', 'Session ended before packing confirmation.'
  from public.shipments shipment
  where shipment.workspace_id = p_workspace_id
    and shipment.packing_session_id = target_session.id
    and shipment.packing_status = 'PACKING';

  update public.shipments
  set packing_status = 'UNPACKED',
      packing_claimed_by = null,
      packing_session_id = null,
      packing_claimed_at = null,
      packing_claim_expires_at = null,
      updated_at = now()
  where workspace_id = p_workspace_id
    and packing_session_id = target_session.id
    and packing_status = 'PACKING';

  update public.reyo_pack_sessions
  set status = 'COMPLETED', ended_by = p_actor_id, ended_at = now(),
      last_activity_at = now(), updated_at = now()
  where id = target_session.id
  returning * into completed_session;

  insert into public.audit_events (
    workspace_id, actor_type, actor_id, action, resource_type, resource_id,
    previous_state, new_state, source
  ) values (
    p_workspace_id, 'human', p_actor_id, 'reyo_pack.session_completed',
    'reyo_pack_session', target_session.id::text,
    jsonb_build_object('status', target_session.status),
    jsonb_build_object(
      'status', completed_session.status,
      'packagesPacked', completed_session.packages_packed,
      'unitsPacked', completed_session.units_packed,
      'endedAt', completed_session.ended_at
    ),
    'reyo_pack_api'
  );

  return jsonb_build_object(
    'outcome', 'COMPLETED',
    'sessionId', completed_session.id,
    'sessionNumber', completed_session.session_number,
    'packagesPacked', completed_session.packages_packed,
    'unitsPacked', completed_session.units_packed,
    'cancelledScans', completed_session.cancelled_scans,
    'invalidScans', completed_session.invalid_scans,
    'errors', completed_session.error_count,
    'startedAt', completed_session.started_at,
    'endedAt', completed_session.ended_at
  );
end;
$$;

create or replace function public.claim_reyo_pack_shipment(
  p_workspace_id uuid,
  p_actor_id uuid,
  p_session_id uuid,
  p_barcode text,
  p_idempotency_key text,
  p_marketplace_account_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_barcode text;
  active_session public.reyo_pack_sessions%rowtype;
  target_shipment public.shipments%rowtype;
  target_order public.orders%rowtype;
  candidate_count integer;
  claim_ttl integer;
  previous_packing_status text;
  item_payload jsonb;
  result_payload jsonb;
begin
  if char_length(coalesce(p_idempotency_key, '')) not between 8 and 200 then
    raise exception using errcode = '22023', message = 'A valid scan idempotency key is required.';
  end if;

  select metadata -> 'result' into result_payload
  from public.reyo_pack_packing_events
  where workspace_id = p_workspace_id and idempotency_key = p_idempotency_key;
  if found then
    return result_payload;
  end if;

  select * into active_session
  from public.reyo_pack_sessions
  where workspace_id = p_workspace_id
    and id = p_session_id
    and started_by = p_actor_id
  for update;
  if not found or active_session.status <> 'ACTIVE' or active_session.mode <> 'PACKING' then
    raise exception using errcode = '22023', message = 'An active packing session is required.';
  end if;

  normalized_barcode := private.normalize_reyo_pack_barcode(coalesce(p_barcode, ''));
  if normalized_barcode = '' or char_length(normalized_barcode) > 200 then
    result_payload := jsonb_build_object(
      'outcome', 'INVALID_BARCODE',
      'message', 'The scanned barcode is empty or unsupported.'
    );
    insert into public.reyo_pack_packing_events (
      workspace_id, session_id, actor_id, event_type, awb,
      idempotency_key, metadata
    ) values (
      p_workspace_id, p_session_id, p_actor_id, 'BARCODE_UNKNOWN',
      left(coalesce(p_barcode, ''), 200), p_idempotency_key,
      jsonb_build_object('result', result_payload)
    );
    update public.reyo_pack_sessions
    set invalid_scans = invalid_scans + 1, last_activity_at = now(), updated_at = now()
    where id = p_session_id;
    return result_payload;
  end if;

  select count(*) into candidate_count
  from public.shipments shipment
  where shipment.workspace_id = p_workspace_id
    and shipment.awb_normalized = normalized_barcode
    and (p_marketplace_account_id is null
      or shipment.marketplace_account_id = p_marketplace_account_id);

  if candidate_count = 0 then
    result_payload := jsonb_build_object(
      'outcome', 'BARCODE_NOT_FOUND',
      'barcode', normalized_barcode,
      'message', 'No synchronized shipment matches this barcode.'
    );
    insert into public.reyo_pack_packing_events (
      workspace_id, session_id, actor_id, event_type, awb,
      idempotency_key, metadata
    ) values (
      p_workspace_id, p_session_id, p_actor_id, 'BARCODE_UNKNOWN',
      normalized_barcode, p_idempotency_key,
      jsonb_build_object('result', result_payload)
    );
    update public.reyo_pack_sessions
    set invalid_scans = invalid_scans + 1, last_activity_at = now(), updated_at = now()
    where id = p_session_id;
    return result_payload;
  end if;

  if candidate_count > 1 then
    result_payload := jsonb_build_object(
      'outcome', 'AMBIGUOUS_BARCODE',
      'barcode', normalized_barcode,
      'message', 'This AWB exists in more than one marketplace account. Select an account and scan again.'
    );
    insert into public.reyo_pack_packing_events (
      workspace_id, session_id, actor_id, event_type, awb,
      idempotency_key, metadata
    ) values (
      p_workspace_id, p_session_id, p_actor_id, 'ERROR',
      normalized_barcode, p_idempotency_key,
      jsonb_build_object('result', result_payload)
    );
    update public.reyo_pack_sessions
    set error_count = error_count + 1, last_activity_at = now(), updated_at = now()
    where id = p_session_id;
    return result_payload;
  end if;

  select * into target_shipment
  from public.shipments shipment
  where shipment.workspace_id = p_workspace_id
    and shipment.awb_normalized = normalized_barcode
    and (p_marketplace_account_id is null
      or shipment.marketplace_account_id = p_marketplace_account_id)
  limit 1
  for update;

  select * into target_order
  from public.orders
  where workspace_id = p_workspace_id and id = target_shipment.order_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Shipment order not found.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'orderItemId', item.id,
    'sku', item.seller_sku,
    'asin', item.asin,
    'title', coalesce(catalog.product_title, item.title),
    'size', catalog.size_label,
    'quantity', coalesce(allocation.quantity, item.quantity_remaining),
    'quantityRemaining', item.quantity_remaining
  ) order by item.created_at, item.id), '[]'::jsonb)
  into item_payload
  from public.order_items item
  left join public.reyo_pack_shipment_items allocation
    on allocation.workspace_id = p_workspace_id
   and allocation.shipment_id = target_shipment.id
   and allocation.order_item_id = item.id
  left join public.reyo_pack_skus catalog
    on catalog.workspace_id = p_workspace_id and catalog.id = item.reyo_pack_sku_id
  where item.workspace_id = p_workspace_id
    and item.order_id = target_order.id
    and (
      allocation.id is not null
      or not exists (
        select 1 from public.reyo_pack_shipment_items existing_allocation
        where existing_allocation.workspace_id = p_workspace_id
          and existing_allocation.shipment_id = target_shipment.id
      )
    );

  if target_order.cancellation_status = 'CANCELLED'
     or lower(target_order.status) in ('canceled', 'cancelled', 'unfulfillable')
     or target_shipment.packing_status = 'CANCELLED' then
    if target_shipment.packing_status <> 'CANCELLED' then
      update public.shipments
      set packing_status = 'CANCELLED', packing_claimed_by = null,
          packing_session_id = null, packing_claimed_at = null,
          packing_claim_expires_at = null, updated_at = now()
      where id = target_shipment.id;
    end if;
    result_payload := jsonb_build_object(
      'outcome', 'ORDER_CANCELLED',
      'orderId', target_order.id,
      'amazonOrderId', target_order.channel_order_id,
      'shipmentId', target_shipment.id,
      'awb', target_shipment.awb_code,
      'cancelledAt', target_order.cancelled_at,
      'cancellationReason', target_order.cancellation_reason,
      'items', item_payload
    );
    insert into public.reyo_pack_packing_events (
      workspace_id, order_id, shipment_id, session_id, actor_id, event_type,
      awb, previous_status, new_status, idempotency_key, metadata
    ) values (
      p_workspace_id, target_order.id, target_shipment.id, p_session_id,
      p_actor_id, 'CANCELLED_DETECTED', target_shipment.awb_code,
      target_shipment.packing_status, 'CANCELLED', p_idempotency_key,
      jsonb_build_object('result', result_payload)
    );
    update public.reyo_pack_sessions
    set cancelled_scans = cancelled_scans + 1, last_activity_at = now(), updated_at = now()
    where id = p_session_id;
    return result_payload;
  end if;

  if target_shipment.packing_status = 'PACKED' then
    result_payload := jsonb_build_object(
      'outcome', 'ALREADY_PACKED',
      'orderId', target_order.id,
      'amazonOrderId', target_order.channel_order_id,
      'shipmentId', target_shipment.id,
      'awb', target_shipment.awb_code,
      'packedAt', target_shipment.packed_at,
      'items', item_payload
    );
    insert into public.reyo_pack_packing_events (
      workspace_id, order_id, shipment_id, session_id, actor_id, event_type,
      awb, previous_status, new_status, idempotency_key, metadata
    ) values (
      p_workspace_id, target_order.id, target_shipment.id, p_session_id,
      p_actor_id, 'ALREADY_PACKED', target_shipment.awb_code,
      'PACKED', 'PACKED', p_idempotency_key,
      jsonb_build_object('result', result_payload)
    );
    update public.reyo_pack_sessions
    set last_activity_at = now(), updated_at = now()
    where id = p_session_id;
    return result_payload;
  end if;

  if target_shipment.packing_status = 'ERROR' then
    result_payload := jsonb_build_object(
      'outcome', 'PACKING_ERROR',
      'orderId', target_order.id,
      'amazonOrderId', target_order.channel_order_id,
      'shipmentId', target_shipment.id,
      'awb', target_shipment.awb_code,
      'message', 'This shipment requires an administrator to resolve its error state.',
      'items', item_payload
    );
    insert into public.reyo_pack_packing_events (
      workspace_id, order_id, shipment_id, session_id, actor_id, event_type,
      awb, previous_status, new_status, idempotency_key, metadata
    ) values (
      p_workspace_id, target_order.id, target_shipment.id, p_session_id,
      p_actor_id, 'ERROR', target_shipment.awb_code,
      'ERROR', 'ERROR', p_idempotency_key,
      jsonb_build_object('result', result_payload)
    );
    update public.reyo_pack_sessions
    set error_count = error_count + 1, last_activity_at = now(), updated_at = now()
    where id = p_session_id;
    return result_payload;
  end if;

  if target_shipment.packing_status = 'PACKING'
     and target_shipment.packing_claim_expires_at > now()
     and (target_shipment.packing_claimed_by <> p_actor_id
       or target_shipment.packing_session_id <> p_session_id) then
    result_payload := jsonb_build_object(
      'outcome', 'IN_USE',
      'orderId', target_order.id,
      'amazonOrderId', target_order.channel_order_id,
      'shipmentId', target_shipment.id,
      'awb', target_shipment.awb_code,
      'claimExpiresAt', target_shipment.packing_claim_expires_at,
      'message', 'Another packing session currently holds this shipment.'
    );
    insert into public.reyo_pack_packing_events (
      workspace_id, order_id, shipment_id, session_id, actor_id, event_type,
      awb, previous_status, new_status, idempotency_key, metadata
    ) values (
      p_workspace_id, target_order.id, target_shipment.id, p_session_id,
      p_actor_id, 'ERROR', target_shipment.awb_code,
      'PACKING', 'PACKING', p_idempotency_key,
      jsonb_build_object('result', result_payload)
    );
    update public.reyo_pack_sessions
    set error_count = error_count + 1, last_activity_at = now(), updated_at = now()
    where id = p_session_id;
    return result_payload;
  end if;

  if target_shipment.packing_status = 'PACKING'
     and target_shipment.packing_claim_expires_at <= now() then
    insert into public.reyo_pack_packing_events (
      workspace_id, order_id, shipment_id, session_id, actor_id, event_type,
      awb, previous_status, new_status, reason
    ) values (
      p_workspace_id, target_order.id, target_shipment.id,
      target_shipment.packing_session_id, p_actor_id, 'CLAIM_RELEASED',
      target_shipment.awb_code, 'PACKING', 'UNPACKED',
      'Packing claim lease expired before a new scan.'
    );
    previous_packing_status := 'UNPACKED';
  end if;

  select coalesce(setting.claim_ttl_seconds, 120) into claim_ttl
  from public.reyo_pack_settings setting
  where setting.workspace_id = p_workspace_id;
  claim_ttl := coalesce(claim_ttl, 120);

  previous_packing_status := target_shipment.packing_status;
  update public.shipments
  set packing_status = 'PACKING',
      packing_claimed_by = p_actor_id,
      packing_session_id = p_session_id,
      packing_claimed_at = now(),
      packing_claim_expires_at = now() + make_interval(secs => claim_ttl),
      updated_at = now()
  where id = target_shipment.id
  returning * into target_shipment;

  result_payload := jsonb_build_object(
    'outcome', 'ORDER_FOUND',
    'orderId', target_order.id,
    'amazonOrderId', target_order.channel_order_id,
    'shipmentId', target_shipment.id,
    'awb', target_shipment.awb_code,
    'packingStatus', target_shipment.packing_status,
    'shipByDate', target_order.ship_by_date,
    'shippingMethod', coalesce(target_order.shipping_service_level, target_order.shipping_method),
    'labelAvailable', exists (
      select 1 from public.reyo_pack_label_documents label
      where label.workspace_id = p_workspace_id
        and label.shipment_id = target_shipment.id
    ),
    'claimExpiresAt', target_shipment.packing_claim_expires_at,
    'items', item_payload
  );

  insert into public.reyo_pack_packing_events (
    workspace_id, order_id, shipment_id, session_id, actor_id, event_type,
    awb, previous_status, new_status, idempotency_key, metadata
  ) values (
    p_workspace_id, target_order.id, target_shipment.id, p_session_id,
    p_actor_id, 'CLAIMED', target_shipment.awb_code,
    previous_packing_status,
    'PACKING', p_idempotency_key, jsonb_build_object('result', result_payload)
  );
  update public.reyo_pack_sessions
  set last_activity_at = now(), updated_at = now()
  where id = p_session_id;

  return result_payload;
end;
$$;

create or replace function public.abandon_stale_reyo_pack_sessions(
  p_idle_minutes integer default 480
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  stale_session public.reyo_pack_sessions%rowtype;
  abandoned_count integer := 0;
begin
  if p_idle_minutes < 5 or p_idle_minutes > 10080 then
    raise exception using errcode = '22023', message = 'Session idle threshold is outside the allowed range.';
  end if;

  for stale_session in
    select * from public.reyo_pack_sessions
    where status = 'ACTIVE'
      and last_activity_at < now() - make_interval(mins => p_idle_minutes)
    order by last_activity_at
    for update skip locked
  loop
    insert into public.reyo_pack_packing_events (
      workspace_id, order_id, shipment_id, session_id, actor_id, event_type,
      awb, previous_status, new_status, reason
    )
    select shipment.workspace_id, shipment.order_id, shipment.id,
           stale_session.id, stale_session.started_by, 'CLAIM_RELEASED',
           shipment.awb_code, 'PACKING', 'UNPACKED',
           'Packing session was abandoned after its idle timeout.'
    from public.shipments shipment
    where shipment.workspace_id = stale_session.workspace_id
      and shipment.packing_session_id = stale_session.id
      and shipment.packing_status = 'PACKING';

    update public.shipments
    set packing_status = 'UNPACKED', packing_claimed_by = null,
        packing_session_id = null, packing_claimed_at = null,
        packing_claim_expires_at = null, updated_at = now()
    where workspace_id = stale_session.workspace_id
      and packing_session_id = stale_session.id
      and packing_status = 'PACKING';

    update public.reyo_pack_sessions
    set status = 'ABANDONED', ended_at = now(), updated_at = now()
    where id = stale_session.id;

    insert into public.audit_events (
      workspace_id, actor_type, action, resource_type, resource_id,
      previous_state, new_state, source
    ) values (
      stale_session.workspace_id, 'system', 'reyo_pack.session_abandoned',
      'reyo_pack_session', stale_session.id::text,
      jsonb_build_object('status', 'ACTIVE', 'lastActivityAt', stale_session.last_activity_at),
      jsonb_build_object('status', 'ABANDONED', 'endedAt', now()),
      'reyo_pack_session_reaper'
    );
    abandoned_count := abandoned_count + 1;
  end loop;
  return abandoned_count;
end;
$$;

create or replace function public.confirm_reyo_pack_shipment(
  p_workspace_id uuid,
  p_actor_id uuid,
  p_session_id uuid,
  p_shipment_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_session public.reyo_pack_sessions%rowtype;
  target_shipment public.shipments%rowtype;
  target_order public.orders%rowtype;
  allocation_count integer;
  shipment_count integer;
  unit_count integer;
  packed_items jsonb;
  result_payload jsonb;
  confirmation_time timestamptz := now();
begin
  if char_length(coalesce(p_idempotency_key, '')) not between 8 and 200 then
    raise exception using errcode = '22023', message = 'A valid packing idempotency key is required.';
  end if;

  select metadata -> 'result' into result_payload
  from public.reyo_pack_packing_events
  where workspace_id = p_workspace_id
    and idempotency_key = p_idempotency_key;
  if found then
    return result_payload;
  end if;

  select * into active_session
  from public.reyo_pack_sessions
  where workspace_id = p_workspace_id
    and id = p_session_id
    and started_by = p_actor_id
  for update;
  if not found or active_session.status <> 'ACTIVE' or active_session.mode <> 'PACKING' then
    raise exception using errcode = '22023', message = 'An active packing session is required.';
  end if;

  select * into target_shipment
  from public.shipments
  where workspace_id = p_workspace_id and id = p_shipment_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Shipment not found.';
  end if;

  select * into target_order
  from public.orders
  where workspace_id = p_workspace_id and id = target_shipment.order_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Shipment order not found.';
  end if;

  if target_order.cancellation_status = 'CANCELLED'
     or lower(target_order.status) in ('canceled', 'cancelled', 'unfulfillable')
     or target_shipment.packing_status = 'CANCELLED' then
    update public.shipments
    set packing_status = 'CANCELLED', packing_claimed_by = null,
        packing_session_id = null, packing_claimed_at = null,
        packing_claim_expires_at = null, updated_at = now()
    where id = target_shipment.id;
    result_payload := jsonb_build_object(
      'outcome', 'ORDER_CANCELLED',
      'orderId', target_order.id,
      'amazonOrderId', target_order.channel_order_id,
      'shipmentId', target_shipment.id,
      'awb', target_shipment.awb_code,
      'cancelledAt', target_order.cancelled_at,
      'message', 'Amazon has cancelled this order. Do not pack it.'
    );
    insert into public.reyo_pack_packing_events (
      workspace_id, order_id, shipment_id, session_id, actor_id, event_type,
      awb, previous_status, new_status, idempotency_key, metadata
    ) values (
      p_workspace_id, target_order.id, target_shipment.id, p_session_id,
      p_actor_id, 'CANCELLED_DETECTED', target_shipment.awb_code,
      target_shipment.packing_status, 'CANCELLED', p_idempotency_key,
      jsonb_build_object('result', result_payload)
    );
    update public.reyo_pack_sessions
    set cancelled_scans = cancelled_scans + 1, last_activity_at = now(), updated_at = now()
    where id = p_session_id;
    return result_payload;
  end if;

  if target_shipment.packing_status = 'PACKED' then
    return jsonb_build_object(
      'outcome', 'ALREADY_PACKED',
      'orderId', target_order.id,
      'amazonOrderId', target_order.channel_order_id,
      'shipmentId', target_shipment.id,
      'awb', target_shipment.awb_code,
      'packedAt', target_shipment.packed_at,
      'message', 'This package was already packed.'
    );
  end if;

  if target_shipment.packing_status <> 'PACKING'
     or target_shipment.packing_claimed_by is distinct from p_actor_id
     or target_shipment.packing_session_id is distinct from p_session_id
     or target_shipment.packing_claim_expires_at <= now() then
    return jsonb_build_object(
      'outcome', 'CLAIM_REQUIRED',
      'orderId', target_order.id,
      'shipmentId', target_shipment.id,
      'awb', target_shipment.awb_code,
      'message', 'Scan this AWB again to obtain a current packing claim.'
    );
  end if;

  select count(*) into allocation_count
  from public.reyo_pack_shipment_items allocation
  where allocation.workspace_id = p_workspace_id
    and allocation.shipment_id = target_shipment.id;

  if allocation_count = 0 then
    select count(*) into shipment_count
    from public.shipments shipment
    where shipment.workspace_id = p_workspace_id
      and shipment.order_id = target_order.id
      and shipment.packing_status <> 'CANCELLED';
    if shipment_count <> 1 then
      update public.shipments
      set packing_status = 'ERROR', packing_claimed_by = null,
          packing_session_id = null, packing_claimed_at = null,
          packing_claim_expires_at = null, updated_at = now()
      where id = target_shipment.id;
      result_payload := jsonb_build_object(
        'outcome', 'SHIPMENT_ITEMS_REQUIRED',
        'orderId', target_order.id,
        'shipmentId', target_shipment.id,
        'awb', target_shipment.awb_code,
        'message', 'Amazon shipment-item allocation is missing for this multi-package order. Synchronize shipping data before packing.'
      );
      insert into public.reyo_pack_packing_events (
        workspace_id, order_id, shipment_id, session_id, actor_id, event_type,
        awb, previous_status, new_status, idempotency_key, reason, metadata
      ) values (
        p_workspace_id, target_order.id, target_shipment.id, p_session_id,
        p_actor_id, 'ERROR', target_shipment.awb_code, 'PACKING', 'ERROR',
        p_idempotency_key, 'Shipment-item allocation missing for multi-package order.',
        jsonb_build_object('result', result_payload)
      );
      update public.reyo_pack_sessions
      set error_count = error_count + 1, last_activity_at = now(), updated_at = now()
      where id = p_session_id;
      return result_payload;
    end if;

    select coalesce(sum(item.quantity_remaining), 0)::integer,
           coalesce(jsonb_agg(jsonb_build_object(
             'orderItemId', item.id,
             'sku', item.seller_sku,
             'asin', item.asin,
             'title', coalesce(catalog.product_title, item.title),
             'size', catalog.size_label,
             'quantity', item.quantity_remaining
           ) order by item.created_at, item.id)
             filter (where item.id is not null), '[]'::jsonb)
    into unit_count, packed_items
    from public.order_items item
    left join public.reyo_pack_skus catalog
      on catalog.workspace_id = p_workspace_id and catalog.id = item.reyo_pack_sku_id
    where item.workspace_id = p_workspace_id and item.order_id = target_order.id;
  else
    if exists (
      select 1
      from public.reyo_pack_shipment_items allocation
      join public.order_items item
        on item.workspace_id = allocation.workspace_id
       and item.id = allocation.order_item_id
      where allocation.workspace_id = p_workspace_id
        and allocation.shipment_id = target_shipment.id
        and allocation.quantity > item.quantity_remaining
    ) then
      update public.shipments
      set packing_status = 'ERROR', packing_claimed_by = null,
          packing_session_id = null, packing_claimed_at = null,
          packing_claim_expires_at = null, updated_at = now()
      where id = target_shipment.id;
      result_payload := jsonb_build_object(
        'outcome', 'SHIPMENT_QUANTITY_CONFLICT',
        'orderId', target_order.id,
        'shipmentId', target_shipment.id,
        'awb', target_shipment.awb_code,
        'message', 'Synchronized shipment quantities exceed the remaining order quantities. Refresh shipping data before packing.'
      );
      insert into public.reyo_pack_packing_events (
        workspace_id, order_id, shipment_id, session_id, actor_id, event_type,
        awb, previous_status, new_status, idempotency_key, reason, metadata
      ) values (
        p_workspace_id, target_order.id, target_shipment.id, p_session_id,
        p_actor_id, 'ERROR', target_shipment.awb_code, 'PACKING', 'ERROR',
        p_idempotency_key, 'Shipment allocation exceeds remaining quantity.',
        jsonb_build_object('result', result_payload)
      );
      update public.reyo_pack_sessions
      set error_count = error_count + 1, last_activity_at = now(), updated_at = now()
      where id = p_session_id;
      return result_payload;
    end if;

    select coalesce(sum(allocation.quantity), 0)::integer,
           coalesce(jsonb_agg(jsonb_build_object(
             'orderItemId', item.id,
             'sku', item.seller_sku,
             'asin', item.asin,
             'title', coalesce(catalog.product_title, item.title),
             'size', catalog.size_label,
             'quantity', allocation.quantity
           ) order by item.created_at, item.id), '[]'::jsonb)
    into unit_count, packed_items
    from public.reyo_pack_shipment_items allocation
    join public.order_items item
      on item.workspace_id = allocation.workspace_id
     and item.id = allocation.order_item_id
    left join public.reyo_pack_skus catalog
      on catalog.workspace_id = p_workspace_id and catalog.id = item.reyo_pack_sku_id
    where allocation.workspace_id = p_workspace_id
      and allocation.shipment_id = target_shipment.id;
  end if;

  if unit_count <= 0 then
    update public.shipments
    set packing_status = 'ERROR', packing_claimed_by = null,
        packing_session_id = null, packing_claimed_at = null,
        packing_claim_expires_at = null, updated_at = now()
    where id = target_shipment.id;
    result_payload := jsonb_build_object(
      'outcome', 'NO_PACKABLE_UNITS',
      'orderId', target_order.id,
      'shipmentId', target_shipment.id,
      'awb', target_shipment.awb_code,
      'message', 'This shipment has no remaining synchronized units to pack.'
    );
    insert into public.reyo_pack_packing_events (
      workspace_id, order_id, shipment_id, session_id, actor_id, event_type,
      awb, previous_status, new_status, idempotency_key, reason, metadata
    ) values (
      p_workspace_id, target_order.id, target_shipment.id, p_session_id,
      p_actor_id, 'ERROR', target_shipment.awb_code, 'PACKING', 'ERROR',
      p_idempotency_key, 'No packable synchronized units.',
      jsonb_build_object('result', result_payload)
    );
    update public.reyo_pack_sessions
    set error_count = error_count + 1, last_activity_at = now(), updated_at = now()
    where id = p_session_id;
    return result_payload;
  end if;

  result_payload := jsonb_build_object(
    'outcome', 'PACKED',
    'orderId', target_order.id,
    'amazonOrderId', target_order.channel_order_id,
    'shipmentId', target_shipment.id,
    'awb', target_shipment.awb_code,
    'packedAt', confirmation_time,
    'unitsPacked', unit_count,
    'items', packed_items
  );

  -- This partial unique index plus the shipment row lock guarantees one and
  -- only one authoritative package transition under concurrent requests.
  insert into public.reyo_pack_packing_events (
    workspace_id, order_id, shipment_id, session_id, actor_id, event_type,
    awb, quantity, previous_status, new_status, idempotency_key, metadata
  ) values (
    p_workspace_id, target_order.id, target_shipment.id, p_session_id,
    p_actor_id, 'PACK_CONFIRMED', target_shipment.awb_code, unit_count,
    'PACKING', 'PACKED', p_idempotency_key,
    jsonb_build_object('result', result_payload)
  );

  if allocation_count = 0 then
    insert into public.reyo_pack_packing_events (
      workspace_id, order_id, shipment_id, session_id, actor_id, event_type,
      awb, sku, quantity, previous_status, new_status, idempotency_key
    )
    select p_workspace_id, target_order.id, target_shipment.id, p_session_id,
           p_actor_id, 'PACK_ITEM', target_shipment.awb_code, item.seller_sku,
           item.quantity_remaining, 'PACKING', 'PACKED',
           p_idempotency_key || ':item:' || item.id::text
    from public.order_items item
    where item.workspace_id = p_workspace_id
      and item.order_id = target_order.id
      and item.quantity_remaining > 0;

    update public.order_items
    set quantity_packed = quantity_ordered, updated_at = confirmation_time
    where workspace_id = p_workspace_id and order_id = target_order.id;
  else
    insert into public.reyo_pack_packing_events (
      workspace_id, order_id, shipment_id, session_id, actor_id, event_type,
      awb, sku, quantity, previous_status, new_status, idempotency_key
    )
    select p_workspace_id, target_order.id, target_shipment.id, p_session_id,
           p_actor_id, 'PACK_ITEM', target_shipment.awb_code, item.seller_sku,
           allocation.quantity, 'PACKING', 'PACKED',
           p_idempotency_key || ':item:' || item.id::text
    from public.reyo_pack_shipment_items allocation
    join public.order_items item
      on item.workspace_id = allocation.workspace_id
     and item.id = allocation.order_item_id
    where allocation.workspace_id = p_workspace_id
      and allocation.shipment_id = target_shipment.id;

    update public.order_items item
    set quantity_packed = least(item.quantity_ordered, item.quantity_packed + allocation.quantity),
        updated_at = confirmation_time
    from public.reyo_pack_shipment_items allocation
    where allocation.workspace_id = p_workspace_id
      and allocation.shipment_id = target_shipment.id
      and item.workspace_id = allocation.workspace_id
      and item.id = allocation.order_item_id;
  end if;

  update public.shipments
  set packing_status = 'PACKED', packed_at = confirmation_time, packed_by = p_actor_id,
      packing_claimed_by = null, packing_session_id = null,
      packing_claimed_at = null, packing_claim_expires_at = null,
      updated_at = confirmation_time
  where id = target_shipment.id;

  if not exists (
    select 1 from public.shipments other_shipment
    where other_shipment.workspace_id = p_workspace_id
      and other_shipment.order_id = target_order.id
      and other_shipment.packing_status not in ('PACKED', 'CANCELLED')
  ) then
    update public.orders
    set warehouse_status = 'packed', version = version + 1, updated_at = confirmation_time
    where workspace_id = p_workspace_id and id = target_order.id;
  end if;

  update public.reyo_pack_sessions
  set packages_packed = packages_packed + 1,
      units_packed = units_packed + unit_count,
      last_activity_at = confirmation_time,
      updated_at = confirmation_time
  where id = p_session_id;

  insert into public.audit_events (
    workspace_id, actor_type, actor_id, action, resource_type, resource_id,
    previous_state, new_state, source
  ) values (
    p_workspace_id, 'human', p_actor_id, 'reyo_pack.order_packed',
    'shipment', target_shipment.id::text,
    jsonb_build_object('packingStatus', 'PACKING'),
    jsonb_build_object(
      'packingStatus', 'PACKED', 'packedAt', confirmation_time,
      'unitsPacked', unit_count, 'sessionId', p_session_id
    ),
    'reyo_pack_api'
  );

  return result_payload;
exception
  when unique_violation then
    select jsonb_build_object(
      'outcome', 'ALREADY_PACKED',
      'orderId', shipment.order_id,
      'shipmentId', shipment.id,
      'awb', shipment.awb_code,
      'packedAt', shipment.packed_at,
      'message', 'Another device packed this package first.'
    ) into result_payload
    from public.shipments shipment
    where shipment.workspace_id = p_workspace_id and shipment.id = p_shipment_id;
    return result_payload;
end;
$$;

-- Amazon synchronization calls this function when a cancellation is observed.
-- Existing PACK_CONFIRMED rows are immutable, so a late cancellation produces a
-- later event rather than rewriting the historical fact that packing occurred.
create or replace function public.apply_reyo_pack_cancellation(
  p_workspace_id uuid,
  p_order_id uuid,
  p_cancelled_at timestamptz,
  p_reason text default null,
  p_correlation_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order public.orders%rowtype;
  effective_cancelled_at timestamptz := coalesce(p_cancelled_at, now());
  changed_shipments integer := 0;
begin
  if char_length(coalesce(p_reason, '')) > 1000 then
    raise exception using errcode = '22023', message = 'Cancellation reason exceeds 1000 characters.';
  end if;

  select * into target_order
  from public.orders
  where workspace_id = p_workspace_id and id = p_order_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Order not found.';
  end if;

  if target_order.cancellation_status = 'CANCELLED' then
    update public.orders
    set cancellation_reason = coalesce(nullif(trim(coalesce(p_reason, '')), ''), cancellation_reason),
        last_amazon_synced_at = greatest(coalesce(last_amazon_synced_at, effective_cancelled_at), effective_cancelled_at),
        updated_at = now()
    where id = target_order.id;
    return jsonb_build_object(
      'outcome', 'ALREADY_CANCELLED',
      'orderId', target_order.id,
      'cancelledAt', target_order.cancelled_at
    );
  end if;

  insert into public.reyo_pack_packing_events (
    workspace_id, order_id, shipment_id, actor_id, event_type, awb,
    previous_status, new_status, reason, correlation_id, metadata
  )
  select shipment.workspace_id, shipment.order_id, shipment.id, null,
         'CANCELLED_DETECTED', shipment.awb_code, shipment.packing_status,
         'CANCELLED', nullif(trim(coalesce(p_reason, '')), ''), p_correlation_id,
         jsonb_build_object(
           'cancelledAt', effective_cancelled_at,
           'wasPacked', shipment.packing_status = 'PACKED'
         )
  from public.shipments shipment
  where shipment.workspace_id = p_workspace_id
    and shipment.order_id = target_order.id
    and shipment.packing_status <> 'CANCELLED';

  update public.shipments
  set packing_status = 'CANCELLED', packing_claimed_by = null,
      packing_session_id = null, packing_claimed_at = null,
      packing_claim_expires_at = null, updated_at = now()
  where workspace_id = p_workspace_id
    and order_id = target_order.id
    and packing_status <> 'CANCELLED';
  get diagnostics changed_shipments = row_count;

  update public.orders
  set status = 'Canceled',
      cancellation_status = 'CANCELLED',
      cancellation_reason = nullif(trim(coalesce(p_reason, '')), ''),
      cancelled_at = effective_cancelled_at,
      last_amazon_synced_at = effective_cancelled_at,
      source_updated_at = effective_cancelled_at,
      version = version + 1,
      updated_at = now()
  where id = target_order.id;

  insert into public.audit_events (
    workspace_id, actor_type, action, resource_type, resource_id,
    previous_state, new_state, source, correlation_id
  ) values (
    p_workspace_id, 'system', 'reyo_pack.order_cancelled', 'order', target_order.id::text,
    jsonb_build_object(
      'amazonStatus', target_order.status,
      'cancellationStatus', target_order.cancellation_status
    ),
    jsonb_build_object(
      'amazonStatus', 'Canceled',
      'cancellationStatus', 'CANCELLED',
      'cancelledAt', effective_cancelled_at,
      'shipmentsChanged', changed_shipments
    ),
    'amazon_sp_api', p_correlation_id
  );

  return jsonb_build_object(
    'outcome', 'CANCELLED',
    'orderId', target_order.id,
    'cancelledAt', effective_cancelled_at,
    'shipmentsChanged', changed_shipments
  );
end;
$$;

create or replace function public.set_reyo_pack_sku_location(
  p_workspace_id uuid,
  p_actor_id uuid,
  p_sku_id uuid,
  p_location_id uuid,
  p_expected_version bigint,
  p_quantity integer default null,
  p_reason text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_sku public.reyo_pack_skus%rowtype;
  target_location public.reyo_pack_locations%rowtype;
  current_assignment public.reyo_pack_sku_locations%rowtype;
  saved_assignment public.reyo_pack_sku_locations%rowtype;
  prior_location_id uuid;
  movement_type text;
  result_payload jsonb;
begin
  if p_quantity is not null and p_quantity < 0 then
    raise exception using errcode = '22023', message = 'Putaway quantity cannot be negative.';
  end if;
  if char_length(coalesce(p_reason, '')) > 500 then
    raise exception using errcode = '22023', message = 'Putaway reason exceeds 500 characters.';
  end if;
  if p_idempotency_key is not null
     and char_length(p_idempotency_key) not between 8 and 200 then
    raise exception using errcode = '22023', message = 'Invalid putaway idempotency key.';
  end if;

  if p_idempotency_key is not null then
    select metadata -> 'result' into result_payload
    from public.reyo_pack_putaway_events
    where workspace_id = p_workspace_id and idempotency_key = p_idempotency_key;
    if found then
      return result_payload;
    end if;
  end if;

  select * into target_sku
  from public.reyo_pack_skus
  where workspace_id = p_workspace_id and id = p_sku_id and active = true
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Active SKU not found.';
  end if;

  select * into target_location
  from public.reyo_pack_locations
  where workspace_id = p_workspace_id and id = p_location_id and active = true
  for share;
  if not found then
    raise exception using errcode = 'P0002', message = 'Active putaway location not found.';
  end if;

  select * into current_assignment
  from public.reyo_pack_sku_locations
  where workspace_id = p_workspace_id and sku_id = p_sku_id
  for update;

  if found and current_assignment.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'SKU location version conflict.';
  end if;
  if not found and p_expected_version <> 0 then
    raise exception using errcode = '40001', message = 'SKU location version conflict.';
  end if;

  prior_location_id := current_assignment.location_id;
  movement_type := case when current_assignment.id is null then 'ASSIGNED' else 'MOVED' end;

  insert into public.reyo_pack_sku_locations (
    workspace_id, sku_id, location_id, expected_quantity, assigned_by
  ) values (
    p_workspace_id, p_sku_id, p_location_id, p_quantity, p_actor_id
  )
  on conflict (workspace_id, sku_id) do update
  set location_id = excluded.location_id,
      expected_quantity = excluded.expected_quantity,
      assigned_by = excluded.assigned_by,
      assigned_at = now(),
      version = public.reyo_pack_sku_locations.version + 1,
      updated_at = now()
  returning * into saved_assignment;

  result_payload := jsonb_build_object(
    'outcome', movement_type,
    'skuId', target_sku.id,
    'sku', target_sku.sku,
    'previousLocationId', prior_location_id,
    'locationId', target_location.id,
    'locationCode', target_location.code,
    'version', saved_assignment.version,
    'updatedAt', saved_assignment.updated_at
  );

  insert into public.reyo_pack_putaway_events (
    workspace_id, sku_id, previous_location_id, new_location_id, actor_id,
    event_type, quantity, reason, idempotency_key, metadata
  ) values (
    p_workspace_id, target_sku.id, prior_location_id, target_location.id,
    p_actor_id, movement_type, p_quantity,
    nullif(trim(coalesce(p_reason, '')), ''), p_idempotency_key,
    jsonb_build_object('result', result_payload)
  );

  insert into public.audit_events (
    workspace_id, actor_type, actor_id, action, resource_type, resource_id,
    previous_state, new_state, source
  ) values (
    p_workspace_id, 'human', p_actor_id, 'reyo_pack.sku_location_changed',
    'reyo_pack_sku', target_sku.id::text,
    jsonb_build_object('locationId', prior_location_id),
    jsonb_build_object(
      'locationId', target_location.id,
      'locationCode', target_location.code,
      'version', saved_assignment.version
    ),
    'reyo_pack_api'
  );

  return result_payload;
end;
$$;

create or replace function public.confirm_reyo_putaway(
  p_workspace_id uuid,
  p_actor_id uuid,
  p_session_id uuid,
  p_barcode text,
  p_quantity integer,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_session public.reyo_pack_sessions%rowtype;
  target_sku public.reyo_pack_skus%rowtype;
  target_assignment public.reyo_pack_sku_locations%rowtype;
  target_location public.reyo_pack_locations%rowtype;
  normalized_barcode text;
  result_payload jsonb;
begin
  if p_quantity < 1 or p_quantity > 100000 then
    raise exception using errcode = '22023', message = 'Putaway quantity is outside the allowed range.';
  end if;
  if char_length(coalesce(p_reason, '')) > 500
     or char_length(coalesce(p_idempotency_key, '')) not between 8 and 200 then
    raise exception using errcode = '22023', message = 'Invalid putaway confirmation.';
  end if;

  select metadata -> 'result' into result_payload
  from public.reyo_pack_putaway_events
  where workspace_id = p_workspace_id and idempotency_key = p_idempotency_key;
  if found then
    return result_payload;
  end if;

  select * into active_session
  from public.reyo_pack_sessions
  where workspace_id = p_workspace_id
    and id = p_session_id
    and started_by = p_actor_id
  for update;
  if not found or active_session.status <> 'ACTIVE' or active_session.mode <> 'PUTAWAY' then
    raise exception using errcode = '22023', message = 'An active putaway session is required.';
  end if;

  normalized_barcode := private.normalize_reyo_pack_barcode(coalesce(p_barcode, ''));
  select sku.* into target_sku
  from public.reyo_pack_skus sku
  left join public.reyo_pack_sku_barcodes barcode
    on barcode.workspace_id = sku.workspace_id
   and barcode.sku_id = sku.id
   and barcode.active = true
  where sku.workspace_id = p_workspace_id
    and sku.active = true
    and (
      barcode.barcode_normalized = normalized_barcode
      or sku.sku_normalized = upper(trim(coalesce(p_barcode, '')))
    )
  order by (barcode.barcode_normalized = normalized_barcode) desc
  limit 1
  for update of sku;

  if not found then
    update public.reyo_pack_sessions
    set invalid_scans = invalid_scans + 1, last_activity_at = now(), updated_at = now()
    where id = p_session_id;
    return jsonb_build_object(
      'outcome', 'PRODUCT_NOT_FOUND',
      'barcode', normalized_barcode,
      'message', 'No active SKU or product barcode matches this scan.'
    );
  end if;

  select * into target_assignment
  from public.reyo_pack_sku_locations
  where workspace_id = p_workspace_id and sku_id = target_sku.id
  for share;
  if not found then
    update public.reyo_pack_sessions
    set error_count = error_count + 1, last_activity_at = now(), updated_at = now()
    where id = p_session_id;
    return jsonb_build_object(
      'outcome', 'LOCATION_NOT_ASSIGNED',
      'skuId', target_sku.id,
      'sku', target_sku.sku,
      'productTitle', target_sku.product_title,
      'message', 'An administrator must assign this SKU to a location.'
    );
  end if;

  select * into target_location
  from public.reyo_pack_locations
  where workspace_id = p_workspace_id
    and id = target_assignment.location_id
    and active = true
  for share;
  if not found then
    update public.reyo_pack_sessions
    set error_count = error_count + 1, last_activity_at = now(), updated_at = now()
    where id = p_session_id;
    return jsonb_build_object(
      'outcome', 'LOCATION_INACTIVE',
      'skuId', target_sku.id,
      'sku', target_sku.sku,
      'message', 'The assigned location is inactive. Ask an administrator to reassign this SKU.'
    );
  end if;

  result_payload := jsonb_build_object(
    'outcome', 'PUTAWAY_CONFIRMED',
    'skuId', target_sku.id,
    'sku', target_sku.sku,
    'asin', target_sku.asin,
    'productTitle', target_sku.product_title,
    'size', target_sku.size_label,
    'locationId', target_location.id,
    'locationCode', target_location.code,
    'locationName', target_location.name,
    'quantity', p_quantity,
    'confirmedAt', now()
  );

  insert into public.reyo_pack_putaway_events (
    workspace_id, sku_id, previous_location_id, new_location_id, session_id,
    actor_id, event_type, quantity, reason, idempotency_key, metadata
  ) values (
    p_workspace_id, target_sku.id, target_location.id, target_location.id,
    p_session_id, p_actor_id, 'CONFIRMED', p_quantity,
    nullif(trim(coalesce(p_reason, '')), ''), p_idempotency_key,
    jsonb_build_object('result', result_payload)
  );

  update public.reyo_pack_sessions
  set putaway_actions = putaway_actions + 1,
      putaway_units = putaway_units + p_quantity,
      last_activity_at = now(), updated_at = now()
  where id = p_session_id;

  insert into public.audit_events (
    workspace_id, actor_type, actor_id, action, resource_type, resource_id,
    new_state, source
  ) values (
    p_workspace_id, 'human', p_actor_id, 'reyo_pack.putaway_confirmed',
    'reyo_pack_sku', target_sku.id::text,
    jsonb_build_object(
      'locationId', target_location.id,
      'locationCode', target_location.code,
      'quantity', p_quantity,
      'sessionId', p_session_id
    ),
    'reyo_pack_api'
  );

  return result_payload;
end;
$$;

-- Tenant-consistency foreign keys protect service-role imports as well as RLS
-- callers. This prevents a correct workspace_id from being paired with a child
-- object that belongs to another tenant.
create unique index if not exists uq_marketplace_accounts_id_workspace
  on public.marketplace_accounts(id, workspace_id);
create unique index if not exists uq_jobs_id_workspace
  on public.jobs(id, workspace_id);
create unique index if not exists uq_warehouses_id_workspace
  on public.warehouses(id, workspace_id);

alter table public.order_items
  add constraint reyo_pack_order_items_order_workspace_fkey
  foreign key (order_id, workspace_id)
  references public.orders(id, workspace_id) on delete cascade;
alter table public.shipments
  add constraint reyo_pack_shipments_order_workspace_fkey
  foreign key (order_id, workspace_id)
  references public.orders(id, workspace_id) on delete cascade;
alter table public.shipments
  add constraint reyo_pack_shipments_session_workspace_fkey
  foreign key (packing_session_id, workspace_id)
  references public.reyo_pack_sessions(id, workspace_id);
alter table public.shipments
  add constraint reyo_pack_shipments_account_workspace_fkey
  foreign key (marketplace_account_id, workspace_id)
  references public.marketplace_accounts(id, workspace_id);
alter table public.reyo_pack_skus
  add constraint reyo_pack_skus_account_workspace_fkey
  foreign key (marketplace_account_id, workspace_id)
  references public.marketplace_accounts(id, workspace_id);
alter table public.reyo_pack_locations
  add constraint reyo_pack_locations_warehouse_workspace_fkey
  foreign key (warehouse_id, workspace_id)
  references public.warehouses(id, workspace_id);
alter table public.reyo_pack_sync_runs
  add constraint reyo_pack_sync_account_workspace_fkey
  foreign key (marketplace_account_id, workspace_id)
  references public.marketplace_accounts(id, workspace_id) on delete cascade;
alter table public.reyo_pack_sync_runs
  add constraint reyo_pack_sync_job_workspace_fkey
  foreign key (job_id, workspace_id)
  references public.jobs(id, workspace_id);

alter table public.shipments validate constraint shipments_claim_shape_check;

create index if not exists idx_orders_workspace_status_ship_by
  on public.orders(workspace_id, warehouse_status, ship_by_date, purchase_date)
  where cancellation_status = 'NOT_CANCELLED';
create index if not exists idx_orders_workspace_cancelled_at
  on public.orders(workspace_id, cancelled_at desc)
  where cancellation_status = 'CANCELLED';
create index if not exists idx_orders_workspace_amazon_id
  on public.orders(workspace_id, channel_order_id);

-- Members may subscribe to and read operational state through RLS. All direct
-- writes are revoked; authenticated API routes authorize permissions and call
-- the service-role-only functions below.
do $migration$
declare
  current_table text;
  policy_record record;
  reyo_tables text[] := array[
    'reyo_pack_sessions', 'reyo_pack_skus', 'reyo_pack_shipment_items',
    'reyo_pack_packing_events', 'reyo_pack_locations',
    'reyo_pack_sku_barcodes', 'reyo_pack_sku_locations',
    'reyo_pack_putaway_events', 'reyo_pack_settings', 'reyo_pack_sync_runs'
  ];
begin
  foreach current_table in array reyo_tables loop
    execute format('alter table public.%I enable row level security', current_table);
    execute format('alter table public.%I force row level security', current_table);
    for policy_record in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = current_table
    loop
      execute format('drop policy if exists %I on public.%I', policy_record.policyname, current_table);
    end loop;
    execute format(
      'create policy tenant_select on public.%I for select to authenticated using (private.is_workspace_member(workspace_id))',
      current_table
    );
    execute format('revoke all on table public.%I from public, anon, authenticated', current_table);
    execute format('grant select on table public.%I to authenticated', current_table);
    execute format('grant all on table public.%I to service_role', current_table);
  end loop;
end
$migration$;

alter table public.reyo_pack_label_documents enable row level security;
alter table public.reyo_pack_label_documents force row level security;
revoke all on table public.reyo_pack_label_documents from public, anon, authenticated;
grant all on table public.reyo_pack_label_documents to service_role;

grant usage, select on all sequences in schema public to service_role;

revoke all on function public.start_reyo_pack_session(uuid, uuid, text, uuid, text)
  from public, anon, authenticated;
revoke all on function public.end_reyo_pack_session(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.claim_reyo_pack_shipment(uuid, uuid, uuid, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.confirm_reyo_pack_shipment(uuid, uuid, uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.apply_reyo_pack_cancellation(uuid, uuid, timestamptz, text, text)
  from public, anon, authenticated;
revoke all on function public.set_reyo_pack_sku_location(uuid, uuid, uuid, uuid, bigint, integer, text, text)
  from public, anon, authenticated;
revoke all on function public.confirm_reyo_putaway(uuid, uuid, uuid, text, integer, text, text)
  from public, anon, authenticated;
revoke all on function public.abandon_stale_reyo_pack_sessions(integer)
  from public, anon, authenticated;

grant execute on function public.start_reyo_pack_session(uuid, uuid, text, uuid, text)
  to service_role;
grant execute on function public.end_reyo_pack_session(uuid, uuid, uuid)
  to service_role;
grant execute on function public.claim_reyo_pack_shipment(uuid, uuid, uuid, text, text, uuid)
  to service_role;
grant execute on function public.confirm_reyo_pack_shipment(uuid, uuid, uuid, uuid, text)
  to service_role;
grant execute on function public.apply_reyo_pack_cancellation(uuid, uuid, timestamptz, text, text)
  to service_role;
grant execute on function public.set_reyo_pack_sku_location(uuid, uuid, uuid, uuid, bigint, integer, text, text)
  to service_role;
grant execute on function public.confirm_reyo_putaway(uuid, uuid, uuid, text, integer, text, text)
  to service_role;
grant execute on function public.abandon_stale_reyo_pack_sessions(integer)
  to service_role;

-- Supabase Postgres Changes is appropriate for the bounded operational views
-- here; RLS still filters every subscriber. The application uses these tables
-- for invalidation and refetches paginated data rather than streaming datasets.
do $migration$
declare
  current_table text;
  realtime_tables text[] := array[
    'reyo_pack_sessions', 'reyo_pack_packing_events',
    'reyo_pack_sku_locations', 'reyo_pack_locations', 'reyo_pack_sync_runs'
  ];
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach current_table in array realtime_tables loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = current_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I', current_table);
      end if;
    end loop;
  end if;
end
$migration$;

notify pgrst, 'reload schema';
commit;
