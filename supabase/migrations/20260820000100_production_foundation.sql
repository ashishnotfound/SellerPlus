-- SellerPlus production foundation
-- Adds tenant ownership, durable execution primitives, least-privilege RLS,
-- and safe integration/worker storage without rewriting operational data.

begin;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create or replace function private.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members membership
    join public.profiles profile on profile.id = membership.user_id
    where membership.workspace_id = target_workspace_id
      and membership.user_id = (select auth.uid())
      and coalesce(profile.is_suspended, false) = false
  );
$$;

create or replace function private.workspace_role(target_workspace_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select membership.role
  from public.workspace_members membership
  join public.profiles profile on profile.id = membership.user_id
  where membership.workspace_id = target_workspace_id
    and membership.user_id = (select auth.uid())
    and coalesce(profile.is_suspended, false) = false
  limit 1;
$$;

create or replace function private.can_manage_workspace(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.workspace_role(target_workspace_id) in ('owner', 'admin'), false);
$$;

revoke all on function private.is_workspace_member(uuid) from public, anon;
revoke all on function private.workspace_role(uuid) from public, anon;
revoke all on function private.can_manage_workspace(uuid) from public, anon;
grant execute on function private.is_workspace_member(uuid) to authenticated, service_role;
grant execute on function private.workspace_role(uuid) to authenticated, service_role;
grant execute on function private.can_manage_workspace(uuid) to authenticated, service_role;

-- Team roles are deliberately explicit. Application permissions further narrow
-- what each specialist role may do through authenticated server endpoints.
alter table public.workspace_members
  drop constraint if exists workspace_members_role_check;
alter table public.workspace_members
  add constraint workspace_members_role_check
  check (role in (
    'owner', 'admin', 'member', 'viewer', 'ppc_manager',
    'catalog_manager', 'operations', 'finance'
  ));

alter table public.workspaces
  add column if not exists owner_id uuid references public.profiles(id) on delete restrict,
  add column if not exists status text not null default 'active',
  add column if not exists version bigint not null default 1;

update public.workspaces workspace
set owner_id = (
  select membership.user_id
  from public.workspace_members membership
  where membership.workspace_id = workspace.id
  order by (membership.role = 'owner') desc, membership.created_at asc
  limit 1
)
where workspace.owner_id is null;

alter table public.workspaces
  drop constraint if exists workspaces_status_check;
alter table public.workspaces
  add constraint workspaces_status_check check (status in ('active', 'suspended', 'closed'));
alter table public.workspaces
  drop constraint if exists workspaces_owner_required;
alter table public.workspaces
  add constraint workspaces_owner_required check (owner_id is not null) not valid;

-- Add a workspace boundary to all current tenant-owned root tables. Existing
-- rows are mapped to the user's oldest membership; future multi-workspace data
-- must always supply workspace_id explicitly.
do $migration$
declare
  current_table text;
  tenant_tables text[] := array[
    'subscriptions', 'payments', 'products', 'listings', 'warehouses', 'orders',
    'keywords', 'competitors', 'expenses', 'alerts', 'notifications', 'audit_logs',
    'activities', 'api_keys', 'support_tickets', 'ai_generations',
    'seller_financial_metrics', 'product_analytics', 'ad_performance_logs',
    'inventory_planner', 'widget_layouts', 'alert_logs', 'goals', 'milestones',
    'cost_profiles', 'raw_materials', 'advertising_campaigns', 'refunds',
    'listing_alerts', 'llm_settings', 'automation_logs',
    'automation_preferences', 'ai_recommendation_history', 'feature_flag_overrides',
    'ai_knowledge_center', 'ai_usage_logs', 'amazon_connections', 'events', 'jobs',
    'workflow_state', 'approval_policies', 'automation_executions',
    'warehouse_audit_log', 'ai_schedules', 'system_logs', 'ai_telemetry_metrics',
    'heartbeats'
  ];
begin
  foreach current_table in array tenant_tables loop
    if to_regclass(format('public.%I', current_table)) is not null then
      execute format(
        'alter table public.%I add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade',
        current_table
      );

      if exists (
        select 1 from information_schema.columns column_info
        where column_info.table_schema = 'public'
          and column_info.table_name = current_table
          and column_info.column_name = 'user_id'
      ) then
        execute format(
          'update public.%I row_data
             set workspace_id = (
              select wm.workspace_id
              from public.workspace_members wm
              where wm.user_id = row_data.user_id
              order by wm.created_at asc
              limit 1
            )
           where row_data.workspace_id is null',
          current_table
        );
      end if;
    end if;
  end loop;
end
$migration$;

-- Amazon OAuth tables used a differently named owner column.
alter table if exists public.amazon_user_tokens
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table if exists public.amazon_developer_credentials
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table if exists public.ai_response_cache
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table if exists public.ai_resilience_states
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

create index if not exists idx_ai_response_cache_workspace_expiry
  on public.ai_response_cache(workspace_id, expires_at);
create index if not exists idx_ai_resilience_workspace_provider
  on public.ai_resilience_states(workspace_id, provider_model);

delete from public.ai_response_cache where workspace_id is null;
delete from public.ai_resilience_states where workspace_id is null;
alter table public.ai_response_cache alter column workspace_id set not null;
alter table public.ai_resilience_states alter column workspace_id set not null;
alter table public.ai_resilience_states drop constraint if exists ai_resilience_states_pkey;
alter table public.ai_resilience_states
  add constraint ai_resilience_states_pkey primary key (workspace_id, provider_model);

update public.amazon_user_tokens token
set workspace_id = (
  select wm.workspace_id from public.workspace_members wm
  where wm.user_id = token.supabase_user_id
  order by wm.created_at asc limit 1
)
where token.workspace_id is null;

update public.amazon_developer_credentials credential
set workspace_id = (
  select wm.workspace_id from public.workspace_members wm
  where wm.user_id = credential.user_id
  order by wm.created_at asc limit 1
)
where credential.workspace_id is null;

-- Child records receive a denormalized tenant key for fast, auditable RLS and
-- indexed joins. Triggers in application write paths must keep this immutable.
do $migration$
declare
  current_table text;
  child_tables text[] := array[
    'variants', 'master_skus', 'listing_versions', 'inventory', 'shipments',
    'returns', 'keyword_rankings', 'order_items'
  ];
begin
  foreach current_table in array child_tables loop
    if to_regclass(format('public.%I', current_table)) is not null then
      execute format(
        'alter table public.%I add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade',
        current_table
      );
    end if;
  end loop;
end
$migration$;

update public.variants child set workspace_id = parent.workspace_id
from public.products parent where child.product_id = parent.id and child.workspace_id is null;
update public.master_skus child set workspace_id = parent.workspace_id
from public.products parent where child.product_id = parent.id and child.workspace_id is null;
update public.listing_versions child set workspace_id = parent.workspace_id
from public.listings parent where child.listing_id = parent.id and child.workspace_id is null;
update public.inventory child set workspace_id = parent.workspace_id
from public.warehouses parent where child.warehouse_id = parent.id and child.workspace_id is null;
update public.shipments child set workspace_id = parent.workspace_id
from public.orders parent where child.order_id = parent.id and child.workspace_id is null;
update public.returns child set workspace_id = parent.workspace_id
from public.orders parent where child.order_id = parent.id and child.workspace_id is null;
update public.keyword_rankings child set workspace_id = parent.workspace_id
from public.keywords parent where child.keyword_id = parent.id and child.workspace_id is null;
update public.order_items child set workspace_id = parent.workspace_id
from public.orders parent where child.order_id = parent.id and child.workspace_id is null;

-- Enforce non-null workspace ownership for all new writes while allowing a
-- controlled remediation window for any legacy orphan rows.
do $migration$
declare
  current_table text;
  tenant_tables text[] := array[
    'subscriptions', 'payments', 'products', 'variants', 'master_skus', 'listings',
    'listing_versions', 'warehouses', 'inventory', 'orders', 'order_items',
    'shipments', 'returns', 'keywords', 'keyword_rankings', 'competitors',
    'expenses', 'alerts', 'notifications', 'audit_logs', 'activities', 'api_keys',
    'support_tickets', 'ai_generations', 'seller_financial_metrics',
    'product_analytics', 'ad_performance_logs', 'inventory_planner',
    'widget_layouts', 'alert_logs', 'goals', 'milestones', 'cost_profiles',
    'raw_materials', 'advertising_campaigns', 'refunds', 'listing_alerts',
    'llm_settings', 'automation_logs',
    'automation_preferences', 'ai_recommendation_history', 'feature_flag_overrides',
    'ai_knowledge_center', 'ai_usage_logs', 'amazon_connections',
    'amazon_user_tokens', 'amazon_developer_credentials', 'events', 'jobs',
    'ai_response_cache', 'ai_resilience_states',
    'workflow_state', 'approval_policies', 'automation_executions',
    'warehouse_audit_log', 'ai_schedules', 'system_logs', 'ai_telemetry_metrics',
    'heartbeats'
  ];
  constraint_name text;
  has_orphans boolean;
begin
  foreach current_table in array tenant_tables loop
    if to_regclass(format('public.%I', current_table)) is not null then
      constraint_name := left(current_table || '_workspace_required', 63);
      if not exists (
        select 1 from pg_constraint
        where conrelid = to_regclass(format('public.%I', current_table))
          and conname = constraint_name
      ) then
        execute format(
          'alter table public.%I add constraint %I check (workspace_id is not null) not valid',
          current_table,
          constraint_name
        );
      end if;

      execute format(
        'select exists (select 1 from public.%I where workspace_id is null)',
        current_table
      ) into has_orphans;
      if not has_orphans then
        execute format('alter table public.%I validate constraint %I', current_table, constraint_name);
      end if;

      execute format(
        'create index if not exists %I on public.%I (workspace_id)',
        left('idx_' || current_table || '_workspace', 63),
        current_table
      );
    end if;
  end loop;
end
$migration$;

-- Marketplace adapter boundary: secrets live separately and are never exposed
-- through authenticated PostgREST policies.
create table if not exists public.marketplace_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  platform text not null check (platform in ('amazon', 'flipkart', 'meesho')),
  region text not null,
  marketplace_id text not null,
  seller_account_id text not null,
  display_name text not null,
  status text not null default 'pending' check (status in ('pending', 'active', 'expired', 'revoked', 'error')),
  capabilities text[] not null default '{}',
  connection_metadata jsonb not null default '{}',
  authorization_expires_at timestamptz,
  last_healthy_at timestamptz,
  last_error_code text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  unique (workspace_id, platform, marketplace_id, seller_account_id)
);

create table if not exists public.integration_credentials (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  marketplace_account_id uuid references public.marketplace_accounts(id) on delete cascade,
  provider text not null,
  credential_kind text not null,
  ciphertext text not null,
  initialization_vector text not null,
  authentication_tag text not null,
  key_version text not null,
  fingerprint text,
  credential_metadata jsonb not null default '{}',
  expires_at timestamptz,
  last_rotated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, marketplace_account_id, provider, credential_kind)
);

-- Immutable-by-key daily Ads facts. Re-syncing the same Amazon reporting day
-- updates that day; it never replaces unrelated history with a rolling total.
create table if not exists public.advertising_performance_daily (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  marketplace_account_id uuid not null references public.marketplace_accounts(id) on delete cascade,
  synced_by uuid references public.profiles(id) on delete set null,
  campaign_id text not null,
  campaign_name text not null,
  performance_date date not null,
  impressions bigint not null default 0 check (impressions >= 0),
  clicks bigint not null default 0 check (clicks >= 0),
  spend numeric(18, 4) not null default 0 check (spend >= 0),
  attributed_sales numeric(18, 4) not null default 0 check (attributed_sales >= 0),
  attributed_orders bigint not null default 0 check (attributed_orders >= 0),
  currency_code text not null default 'INR',
  data_source text not null default 'amazon_ads_api_v3',
  source_report_id text,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, marketplace_account_id, campaign_id, performance_date)
);

create index if not exists idx_ad_performance_daily_workspace_date
  on public.advertising_performance_daily(workspace_id, performance_date desc);
create index if not exists idx_ad_performance_daily_campaign_date
  on public.advertising_performance_daily(workspace_id, campaign_id, performance_date desc);

create unique index if not exists uq_integration_credentials_scope
  on public.integration_credentials (
    workspace_id,
    coalesce(marketplace_account_id, '00000000-0000-0000-0000-000000000000'::uuid),
    provider,
    credential_kind
  );

create table if not exists public.oauth_states (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('amazon_sp_api', 'amazon_ads')),
  state_hash text not null unique,
  redirect_uri text not null,
  marketplace_account_id uuid references public.marketplace_accounts(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.sync_checkpoints (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  marketplace_account_id uuid not null references public.marketplace_accounts(id) on delete cascade,
  resource_type text not null,
  cursor jsonb not null default '{}',
  last_attempted_at timestamptz,
  last_succeeded_at timestamptz,
  next_run_at timestamptz,
  failure_count integer not null default 0 check (failure_count >= 0),
  freshness_state text not null default 'unknown' check (freshness_state in ('fresh', 'stale', 'syncing', 'error', 'unknown')),
  last_error_code text,
  last_error_message text,
  updated_at timestamptz not null default now(),
  unique (workspace_id, marketplace_account_id, resource_type)
);

-- Deterministic AI/action boundary.
create table if not exists public.action_proposals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  proposed_by uuid references public.profiles(id) on delete set null,
  actor_type text not null check (actor_type in ('human', 'ai', 'automation', 'system')),
  action_type text not null,
  resource_type text not null,
  resource_id text not null,
  marketplace_account_id uuid references public.marketplace_accounts(id) on delete restrict,
  current_state jsonb not null default '{}',
  proposed_state jsonb not null,
  reasoning text not null,
  confidence numeric(5,4) check (confidence between 0 and 1),
  expected_impact jsonb not null default '{}',
  risk_level text not null default 'medium' check (risk_level in ('low', 'medium', 'high', 'critical')),
  status text not null default 'proposed' check (status in ('proposed', 'approval_required', 'approved', 'rejected', 'executing', 'executed', 'failed', 'expired', 'canceled')),
  policy_snapshot jsonb not null default '{}',
  schema_version integer not null default 1,
  expires_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  rejected_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

create table if not exists public.action_executions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  proposal_id uuid not null references public.action_proposals(id) on delete restrict,
  idempotency_key text not null,
  executor_type text not null check (executor_type in ('api', 'worker', 'system')),
  executor_id text,
  status text not null check (status in ('queued', 'running', 'succeeded', 'failed', 'rolled_back')),
  external_request_id text,
  result jsonb,
  error_code text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, idempotency_key)
);

create table if not exists public.idempotency_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  scope text not null,
  idempotency_key text not null,
  request_hash text not null,
  status text not null check (status in ('started', 'completed', 'failed')),
  response_code integer,
  response_body jsonb,
  external_reference text,
  locked_until timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, scope, idempotency_key)
);

create table if not exists public.resource_locks (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  resource_key text not null,
  owner_id text not null,
  fencing_token bigint generated always as identity,
  locked_until timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, resource_key)
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_type text not null check (actor_type in ('human', 'ai', 'automation', 'desktop_worker', 'system')),
  actor_id text,
  action text not null,
  resource_type text not null,
  resource_id text,
  previous_state jsonb,
  new_state jsonb,
  source text not null,
  correlation_id text,
  ip_hash text,
  device_id uuid,
  ai_provider text,
  ai_model text,
  automation_rule_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.feedback_submissions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  submitted_by uuid references public.profiles(id) on delete set null,
  category text not null default 'product_feedback'
    check (category in ('product_feedback', 'bug_report', 'support_request')),
  message text not null check (char_length(message) between 3 and 4000),
  page_path text,
  client_metadata jsonb not null default '{}',
  status text not null default 'new' check (status in ('new', 'reviewing', 'resolved', 'closed')),
  created_at timestamptz not null default now()
);

create table if not exists public.worker_devices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  paired_by uuid references public.profiles(id) on delete set null,
  name text not null,
  platform text not null,
  version text not null,
  public_key text not null,
  device_token_hash text not null unique,
  status text not null default 'offline' check (status in ('online', 'offline', 'paused', 'revoked', 'updating')),
  resource_profile text not null default 'balanced' check (resource_profile in ('eco', 'balanced', 'performance', 'custom')),
  resource_limits jsonb not null default '{}',
  capabilities text[] not null default '{}',
  last_seen_at timestamptz,
  revoked_at timestamptz,
  token_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_memories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  scope_type text not null check (scope_type in ('workspace', 'brand', 'marketplace', 'product', 'workflow')),
  scope_id text,
  memory_key text not null,
  value jsonb not null,
  source text not null check (source in ('seller', 'approved_inference', 'system_default')),
  version integer not null default 1,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, scope_type, scope_id, memory_key, version)
);

create table if not exists public.ai_usage_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  feature text not null,
  provider text not null,
  model text not null,
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  cost_micros bigint check (cost_micros is null or cost_micros >= 0),
  cost_status text not null default 'unknown' check (cost_status in ('provider_reported', 'configured_estimate', 'not_applicable', 'unknown')),
  latency_ms integer check (latency_ms >= 0),
  status text not null check (status in ('succeeded', 'failed', 'cached', 'blocked')),
  correlation_id text,
  created_at timestamptz not null default now()
);

alter table public.ai_usage_records alter column cost_micros drop not null;
alter table public.ai_usage_records alter column cost_micros drop default;
alter table public.ai_usage_records add column if not exists cost_status text not null default 'unknown';
alter table public.ai_usage_records drop constraint if exists ai_usage_records_cost_status_check;
alter table public.ai_usage_records add constraint ai_usage_records_cost_status_check
  check (cost_status in ('provider_reported', 'configured_estimate', 'not_applicable', 'unknown'));

create table if not exists public.ai_budget_policies (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  daily_cost_limit_micros bigint check (daily_cost_limit_micros is null or daily_cost_limit_micros > 0),
  monthly_cost_limit_micros bigint check (monthly_cost_limit_micros is null or monthly_cost_limit_micros > 0),
  daily_token_limit bigint check (daily_token_limit is null or daily_token_limit > 0),
  monthly_token_limit bigint check (monthly_token_limit is null or monthly_token_limit > 0),
  require_known_cost boolean not null default true,
  version bigint not null default 1,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    daily_cost_limit_micros is not null or monthly_cost_limit_micros is not null or
    daily_token_limit is not null or monthly_token_limit is not null
  )
);

create table if not exists public.ai_budget_reservations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  correlation_id text not null,
  estimated_cost_micros bigint check (estimated_cost_micros is null or estimated_cost_micros >= 0),
  estimated_tokens bigint not null check (estimated_tokens >= 0),
  status text not null default 'reserved' check (status in ('reserved', 'settled', 'released', 'expired')),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, correlation_id)
);

create table if not exists public.file_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete set null,
  storage_bucket text not null,
  storage_key text not null,
  original_filename text,
  media_type text not null,
  byte_size bigint not null check (byte_size >= 0),
  checksum_sha256 text not null,
  width integer,
  height integer,
  source_type text not null check (source_type in ('uploaded', 'generated', 'derived', 'imported')),
  parent_asset_id uuid references public.file_assets(id) on delete set null,
  prompt text,
  metadata jsonb not null default '{}',
  approval_state text not null default 'draft' check (approval_state in ('draft', 'approved', 'rejected', 'archived')),
  retention_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, storage_bucket, storage_key)
);

create table if not exists public.automation_controls (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  pause_all_automations boolean not null default false,
  pause_ppc_autopilot boolean not null default false,
  disable_external_actions boolean not null default false,
  stop_desktop_worker_jobs boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

-- Queue repair: the previous two-argument function referenced the renamed
-- queue_name column. Both signatures now use job_type and reclaim stale locks.
alter table public.jobs
  add column if not exists locked_by text,
  add column if not exists worker_id uuid references public.worker_devices(id) on delete set null,
  add column if not exists progress numeric(5,2) not null default 0,
  add column if not exists started_at timestamptz,
  add column if not exists last_error text,
  add column if not exists cancel_requested boolean not null default false,
  add column if not exists resource_key text;

do $migration$
declare
  constraint_record record;
begin
  for constraint_record in
    select conname
    from pg_constraint
    where conrelid = 'public.jobs'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.jobs drop constraint %I', constraint_record.conname);
  end loop;
end
$migration$;

alter table public.jobs
  add constraint jobs_status_check check (status in (
    'queued', 'pending', 'assigned', 'running', 'waiting', 'retrying',
    'completed', 'failed', 'canceled', 'approval_required', 'delayed'
  )),
  drop constraint if exists jobs_progress_check,
  add constraint jobs_progress_check check (progress between 0 and 100);

do $migration$
declare
  constraint_record record;
begin
  for constraint_record in
    select constraint_name
    from information_schema.constraint_column_usage
    where table_schema = 'public'
      and table_name = 'jobs'
      and column_name = 'idempotency_key'
      and constraint_name <> 'jobs_pkey'
  loop
    execute format('alter table public.jobs drop constraint if exists %I', constraint_record.constraint_name);
  end loop;
end
$migration$;

drop index if exists public.jobs_idempotency_key_key;
create unique index if not exists uq_jobs_workspace_idempotency
  on public.jobs(workspace_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists idx_jobs_claimable
  on public.jobs(status, priority, run_at, locked_until)
  where status in ('queued', 'pending', 'waiting', 'retrying', 'running');
create index if not exists idx_jobs_workspace_status_created
  on public.jobs(workspace_id, status, created_at desc);

drop function if exists public.claim_jobs(integer);
drop function if exists public.claim_jobs(integer, integer);
drop function if exists public.claim_jobs(integer, text, integer);

create function public.claim_jobs(
  batch_size integer,
  worker_name text,
  lock_timeout_seconds integer default 300
)
returns setof public.jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  if batch_size < 1 or batch_size > 100 then
    raise exception 'batch_size must be between 1 and 100';
  end if;
  if lock_timeout_seconds < 30 or lock_timeout_seconds > 3600 then
    raise exception 'lock_timeout_seconds must be between 30 and 3600';
  end if;

  return query
  update public.jobs job
  set status = 'running',
      locked_by = worker_name,
      locked_until = now() + make_interval(secs => lock_timeout_seconds),
      started_at = coalesce(job.started_at, now()),
      updated_at = now()
  where job.id in (
    select candidate.id
    from public.jobs candidate
    where candidate.cancel_requested = false
      and candidate.run_at <= now()
      and (
        candidate.status in ('queued', 'pending', 'waiting', 'retrying')
        or (candidate.status = 'running' and candidate.locked_until < now())
      )
    order by candidate.priority asc, candidate.run_at asc, candidate.created_at asc
    limit batch_size
    for update skip locked
  )
  returning job.*;
end;
$$;

create function public.claim_jobs(batch_size integer)
returns setof public.jobs
language sql
security definer
set search_path = ''
as $$
  select * from public.claim_jobs(batch_size, 'sellerplus-worker', 300);
$$;

revoke all on function public.claim_jobs(integer, text, integer) from public, anon, authenticated;
revoke all on function public.claim_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_jobs(integer, text, integer) to service_role;
grant execute on function public.claim_jobs(integer) to service_role;

-- Amazon Ads history belongs to the workspace and marketplace account, not to
-- the human who happened to initiate the sync.
alter table if exists public.advertising_campaigns
  add column if not exists marketplace_account_id uuid references public.marketplace_accounts(id) on delete cascade,
  add column if not exists data_source text not null default 'amazon_ads_api',
  add column if not exists currency_code text not null default 'INR',
  add column if not exists synced_at timestamptz,
  add column if not exists report_start_date date,
  add column if not exists report_end_date date;

do $migration$
declare
  constraint_record record;
begin
  for constraint_record in
    select conname
    from pg_constraint
    where conrelid = 'public.advertising_campaigns'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) ilike '%user_id%campaign_id%'
  loop
    execute format('alter table public.advertising_campaigns drop constraint if exists %I', constraint_record.conname);
  end loop;
end
$migration$;

create unique index if not exists uq_ad_campaign_workspace_account_external
  on public.advertising_campaigns(workspace_id, marketplace_account_id, campaign_id)
  where marketplace_account_id is not null;
create index if not exists idx_ad_campaign_workspace_updated
  on public.advertising_campaigns(workspace_id, updated_at desc);

alter table if exists public.listings
  add column if not exists marketplace_account_id uuid references public.marketplace_accounts(id) on delete cascade,
  add column if not exists marketplace_id text,
  add column if not exists data_source text not null default 'seller_entered',
  add column if not exists source_updated_at timestamptz,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists publication_state text not null default 'draft',
  add column if not exists approved_for_publish_at timestamptz,
  add column if not exists approved_for_publish_by uuid references public.profiles(id) on delete set null,
  add column if not exists version bigint not null default 1;

alter table if exists public.listings
  drop constraint if exists listings_publication_state_check,
  add constraint listings_publication_state_check check (
    publication_state in ('draft', 'approved', 'submitted', 'published', 'failed')
  );

update public.listings
set publication_state = 'published'
where status = 'active'
  and asin is not null
  and publication_state = 'draft';

alter table if exists public.cost_profiles
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists version bigint not null default 1;

do $migration$
declare
  constraint_record record;
begin
  for constraint_record in
    select conname
    from pg_constraint
    where conrelid = 'public.cost_profiles'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) ilike '%user_id%name%'
  loop
    execute format('alter table public.cost_profiles drop constraint if exists %I', constraint_record.conname);
  end loop;
end
$migration$;

create unique index if not exists uq_cost_profiles_workspace_name
  on public.cost_profiles(workspace_id, lower(name));

create unique index if not exists uq_listings_workspace_account_channel_sku
  on public.listings(workspace_id, marketplace_account_id, channel, sku)
  where marketplace_account_id is not null and sku is not null;
create unique index if not exists uq_listings_workspace_manual_channel_sku
  on public.listings(workspace_id, channel, sku)
  where marketplace_account_id is null and sku is not null;
create index if not exists idx_listings_workspace_status_updated
  on public.listings(workspace_id, status, updated_at desc);

alter table if exists public.orders
  add column if not exists marketplace_account_id uuid references public.marketplace_accounts(id) on delete cascade,
  add column if not exists data_source text not null default 'seller_entered',
  add column if not exists source_updated_at timestamptz,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists notes text,
  add column if not exists version bigint not null default 1,
  add column if not exists warehouse_status text not null default 'pending'
    check (warehouse_status in ('pending', 'packed', 'shipped', 'canceled')),
  add column if not exists profit_calculation_status text not null default 'unavailable'
    check (profit_calculation_status in ('unavailable', 'partial', 'complete'));

update public.orders
set warehouse_status = case
  when lower(status) in ('shipped', 'delivered') then 'shipped'
  when lower(status) in ('canceled', 'cancelled', 'unfulfillable') then 'canceled'
  when warehouse_status not in ('packed', 'shipped') then 'pending'
  else warehouse_status
end;

create or replace function private.sync_terminal_order_to_warehouse()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if lower(new.status) in ('shipped', 'delivered') then
    new.warehouse_status := 'shipped';
  elsif lower(new.status) in ('canceled', 'cancelled', 'unfulfillable') then
    new.warehouse_status := 'canceled';
  elsif tg_op = 'INSERT' then
    new.warehouse_status := 'pending';
  else
    new.warehouse_status := old.warehouse_status;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_terminal_order_to_warehouse on public.orders;
create trigger sync_terminal_order_to_warehouse
before insert or update of status on public.orders
for each row execute function private.sync_terminal_order_to_warehouse();

alter table if exists public.listing_alerts
  add column if not exists data_source text not null default 'calculated',
  add column if not exists source_updated_at timestamptz,
  add column if not exists resolved_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

do $migration$
declare
  constraint_record record;
begin
  for constraint_record in
    select conname
    from pg_constraint
    where conrelid = 'public.orders'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) ilike '%user_id%channel%channel_order_id%'
  loop
    execute format('alter table public.orders drop constraint if exists %I', constraint_record.conname);
  end loop;
end
$migration$;

create unique index if not exists uq_orders_workspace_account_channel_external
  on public.orders(workspace_id, marketplace_account_id, channel, channel_order_id)
  where marketplace_account_id is not null;
create index if not exists idx_orders_workspace_purchase
  on public.orders(workspace_id, purchase_date desc);

alter table if exists public.inventory_planner
  add column if not exists marketplace_account_id uuid references public.marketplace_accounts(id) on delete cascade,
  add column if not exists data_source text not null default 'calculated',
  add column if not exists source_updated_at timestamptz;

create unique index if not exists uq_inventory_planner_workspace_account_sku
  on public.inventory_planner(workspace_id, marketplace_account_id, sku)
  where marketplace_account_id is not null;

alter table if exists public.refunds
  add column if not exists marketplace_account_id uuid references public.marketplace_accounts(id) on delete cascade,
  add column if not exists data_source text not null default 'seller_entered',
  add column if not exists source_metadata jsonb not null default '{}',
  add column if not exists updated_at timestamptz not null default now(),
  alter column sku drop not null,
  alter column asin drop not null;

do $migration$
declare
  constraint_record record;
begin
  for constraint_record in
    select conname
    from pg_constraint
    where conrelid = 'public.refunds'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) ilike '%user_id%refund_id%'
  loop
    execute format('alter table public.refunds drop constraint if exists %I', constraint_record.conname);
  end loop;
end
$migration$;

create unique index if not exists uq_refunds_workspace_account_external
  on public.refunds(workspace_id, marketplace_account_id, refund_id)
  where marketplace_account_id is not null;
create index if not exists idx_refunds_workspace_processed
  on public.refunds(workspace_id, processed_at desc);

-- One bounded database aggregation replaces four unbounded PostgREST reads for
-- dashboards and AI context construction.
create or replace function public.get_workspace_bi_summary(
  p_workspace_id uuid,
  p_since timestamptz default now() - interval '30 days'
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'ads', jsonb_build_object(
      'totalSpend', coalesce((select sum(c.spend) from public.advertising_campaigns c where c.workspace_id = p_workspace_id and c.updated_at >= p_since), 0),
      'totalSales', coalesce((select sum(c.sales) from public.advertising_campaigns c where c.workspace_id = p_workspace_id and c.updated_at >= p_since), 0),
      'totalImpressions', coalesce((select sum(c.impressions) from public.advertising_campaigns c where c.workspace_id = p_workspace_id and c.updated_at >= p_since), 0),
      'totalClicks', coalesce((select sum(c.clicks) from public.advertising_campaigns c where c.workspace_id = p_workspace_id and c.updated_at >= p_since), 0),
      'campaignCount', (select count(*) from public.advertising_campaigns c where c.workspace_id = p_workspace_id and c.updated_at >= p_since),
      'activeCampaignCount', (select count(*) from public.advertising_campaigns c where c.workspace_id = p_workspace_id and c.updated_at >= p_since and lower(c.status) in ('enabled', 'active'))
    ),
    'orders', jsonb_build_object(
      'totalRevenue', coalesce((select sum(o.total_amount) from public.orders o where o.workspace_id = p_workspace_id and o.purchase_date >= p_since), 0),
      'totalOrders', (select count(*) from public.orders o where o.workspace_id = p_workspace_id and o.purchase_date >= p_since),
      'totalCommissionFees', coalesce((select sum(o.commission_fees) from public.orders o where o.workspace_id = p_workspace_id and o.purchase_date >= p_since), 0),
      'totalFbaFees', coalesce((select sum(o.fba_fees) from public.orders o where o.workspace_id = p_workspace_id and o.purchase_date >= p_since), 0),
      'totalShippingCost', coalesce((select sum(o.shipping_cost) from public.orders o where o.workspace_id = p_workspace_id and o.purchase_date >= p_since), 0),
      'orderStatusCounts', coalesce((
        select jsonb_object_agg(status_counts.status, status_counts.total)
        from (
          select o.status, count(*) total
          from public.orders o
          where o.workspace_id = p_workspace_id and o.purchase_date >= p_since
          group by o.status
        ) status_counts
      ), '{}'::jsonb)
    ),
    'inventory', jsonb_build_object(
      'totalItems', (select count(*) from public.listings l where l.workspace_id = p_workspace_id and l.status = 'active'),
      'lowStockItems', (select count(*) from public.listings l where l.workspace_id = p_workspace_id and l.status = 'active' and coalesce(l.available_qty, 0) between 1 and 19),
      'outOfStockItems', (select count(*) from public.listings l where l.workspace_id = p_workspace_id and l.status = 'active' and coalesce(l.available_qty, 0) = 0)
    ),
    'cogs', jsonb_build_object(
      'totalCogs', coalesce((
        select sum(
          coalesce(l.units_sold_30d, 0) * (
            coalesce(cp.printing_cost, 0) + coalesce(cp.material_cost, 0) +
            coalesce(cp.packaging_cost, 0) + coalesce(cp.shipping_cost, 0) +
            coalesce(cp.labor_cost, 0) + coalesce(cp.misc_cost, 0)
          )
        )
        from public.listings l
        join public.cost_profiles cp on cp.id = l.cost_profile_id and cp.workspace_id = p_workspace_id
        where l.workspace_id = p_workspace_id and l.status = 'active'
      ), 0),
      'listingsWithCostProfile', (
        select count(*) from public.listings l
        where l.workspace_id = p_workspace_id and l.status = 'active' and l.cost_profile_id is not null
      )
    )
  );
$$;

revoke all on function public.get_workspace_bi_summary(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.get_workspace_bi_summary(uuid, timestamptz) to service_role;

create or replace function public.get_workspace_bi_summary_range(
  p_workspace_id uuid,
  p_since timestamptz,
  p_until timestamptz
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with all_orders as materialized (
    select * from public.orders order_row
    where order_row.workspace_id = p_workspace_id
      and order_row.purchase_date >= p_since
      and order_row.purchase_date < p_until
  ),
  valid_orders as materialized (
    select * from all_orders
    where lower(status) not in ('canceled', 'cancelled', 'unfulfillable')
  ),
  order_totals as (
    select
      count(*) as total_orders,
      coalesce(sum(total_amount), 0) as total_revenue,
      coalesce(sum(commission_fees), 0) as commission_fees,
      coalesce(sum(fba_fees), 0) as fba_fees,
      coalesce(sum(shipping_cost), 0) as shipping_cost,
      count(*) filter (where profit_calculation_status = 'complete') as profit_complete_orders,
      case when count(*) > 0 and count(*) filter (where profit_calculation_status = 'complete') = count(*)
        then coalesce(sum(net_profit), 0) else null end as total_net_profit,
      max(source_updated_at) as source_updated_at
    from valid_orders
  ),
  order_statuses as (
    select coalesce(jsonb_object_agg(status_counts.status, status_counts.total), '{}'::jsonb) as counts
    from (
      select status, count(*) total from all_orders group by status
    ) status_counts
  ),
  top_product as (
    select
      coalesce(item.seller_sku, 'Unknown') as sku,
      coalesce(max(item.title), item.seller_sku, 'Unknown') as title,
      sum(greatest(coalesce(item.quantity_ordered, 0), 0)) as units,
      sum(coalesce(item.item_price, 0)) as revenue
    from public.order_items item
    join valid_orders order_row on order_row.id = item.order_id
    where item.workspace_id = p_workspace_id
    group by item.seller_sku
    order by revenue desc, units desc
    limit 1
  ),
  ad_totals as (
    select
      count(*) as fact_count,
      coalesce(sum(spend), 0) as spend,
      coalesce(sum(attributed_sales), 0) as sales,
      coalesce(sum(impressions), 0) as impressions,
      coalesce(sum(clicks), 0) as clicks,
      count(distinct campaign_id) as campaigns,
      min(performance_date) as earliest_date,
      max(performance_date) as latest_date,
      max(synced_at) as source_updated_at
    from public.advertising_performance_daily fact
    where fact.workspace_id = p_workspace_id
      and fact.performance_date >= p_since::date
      and fact.performance_date < p_until::date
  ),
  active_inventory as (
    select
      count(*) as total_items,
      count(*) filter (where coalesce(available_qty, 0) between 1 and 19) as low_stock,
      count(*) filter (where coalesce(available_qty, 0) = 0) as out_of_stock,
      max(source_updated_at) as source_updated_at
    from public.listings listing
    where listing.workspace_id = p_workspace_id and listing.status = 'active'
  ),
  costs_by_sku as (
    select distinct on (listing.sku)
      listing.sku,
      coalesce(cost.printing_cost, 0) + coalesce(cost.material_cost, 0) +
      coalesce(cost.packaging_cost, 0) + coalesce(cost.shipping_cost, 0) +
      coalesce(cost.labor_cost, 0) + coalesce(cost.misc_cost, 0) as unit_cost
    from public.listings listing
    join public.cost_profiles cost
      on cost.id = listing.cost_profile_id and cost.workspace_id = p_workspace_id
    where listing.workspace_id = p_workspace_id and listing.sku is not null
    order by listing.sku, listing.updated_at desc
  ),
  order_costs as (
    select
      coalesce(sum(greatest(coalesce(item.quantity_ordered, 0), 0)), 0) as total_units,
      coalesce(sum(greatest(coalesce(item.quantity_ordered, 0), 0)) filter (where cost.unit_cost is not null), 0) as covered_units,
      coalesce(sum(greatest(coalesce(item.quantity_ordered, 0), 0) * cost.unit_cost) filter (where cost.unit_cost is not null), 0) as covered_cogs
    from public.order_items item
    join valid_orders order_row on order_row.id = item.order_id
    left join costs_by_sku cost on cost.sku = item.seller_sku
    where item.workspace_id = p_workspace_id
  )
  select jsonb_build_object(
    'dataWindow', jsonb_build_object('since', p_since, 'until', p_until),
    'ads', jsonb_build_object(
      'totalSpend', ad.spend,
      'totalSales', ad.sales,
      'totalImpressions', ad.impressions,
      'totalClicks', ad.clicks,
      'campaignCount', ad.campaigns,
      'activeCampaignCount', (
        select count(*) from public.advertising_campaigns campaign
        where campaign.workspace_id = p_workspace_id and lower(campaign.status) in ('enabled', 'active')
      ),
      'dataAvailable', ad.fact_count > 0,
      'earliestDate', ad.earliest_date,
      'latestDate', ad.latest_date,
      'sourceUpdatedAt', ad.source_updated_at,
      'dataSource', 'amazon_ads_api_v3_daily'
    ),
    'orders', jsonb_build_object(
      'totalRevenue', orders.total_revenue,
      'totalOrders', orders.total_orders,
      'totalCommissionFees', orders.commission_fees,
      'totalFbaFees', orders.fba_fees,
      'totalShippingCost', orders.shipping_cost,
      'totalNetProfit', orders.total_net_profit,
      'profitCoverage', case when orders.total_orders = 0 then 0
        else round(100.0 * orders.profit_complete_orders / orders.total_orders, 1) end,
      'orderStatusCounts', statuses.counts,
      'topProduct', case when product.sku is null then null else jsonb_build_object(
        'sku', product.sku, 'title', product.title, 'units', product.units, 'revenue', product.revenue
      ) end,
      'sourceUpdatedAt', orders.source_updated_at,
      'dataSource', 'amazon_sp_api'
    ),
    'inventory', jsonb_build_object(
      'totalItems', inventory.total_items,
      'lowStockItems', inventory.low_stock,
      'outOfStockItems', inventory.out_of_stock,
      'sourceUpdatedAt', inventory.source_updated_at,
      'dataSource', 'amazon_sp_api_report'
    ),
    'cogs', jsonb_build_object(
      'totalCogs', case when order_costs.total_units = order_costs.covered_units then order_costs.covered_cogs else null end,
      'coveredUnits', order_costs.covered_units,
      'totalUnits', order_costs.total_units,
      'coverage', case when order_costs.total_units = 0 then 0
        else round(100.0 * order_costs.covered_units / order_costs.total_units, 1) end,
      'listingsWithCostProfile', (
        select count(*) from public.listings listing
        where listing.workspace_id = p_workspace_id and listing.status = 'active' and listing.cost_profile_id is not null
      ),
      'dataSource', 'seller_entered_cost_profiles'
    )
  )
  from order_totals orders
  cross join order_statuses statuses
  cross join ad_totals ad
  cross join active_inventory inventory
  cross join order_costs
  left join top_product product on true;
$$;

revoke all on function public.get_workspace_bi_summary_range(uuid, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.get_workspace_bi_summary_range(uuid, timestamptz, timestamptz)
  to service_role;

-- Source-qualified daily finance facts for reports. Amazon fee totals remain
-- unavailable until a dedicated Finances settlement/fee importer supplies
-- them; zero is never substituted for a missing fee source.
create or replace function public.get_workspace_financial_daily(
  p_workspace_id uuid,
  p_since date,
  p_until date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if p_since is null or p_until is null or p_since >= p_until then
    raise exception 'A valid financial data window is required.';
  end if;
  if p_until - p_since > 731 then
    raise exception 'Financial data windows are limited to 731 days.';
  end if;

  with valid_orders as materialized (
    select * from public.orders order_row
    where order_row.workspace_id = p_workspace_id
      and order_row.purchase_date::date >= p_since
      and order_row.purchase_date::date < p_until
      and lower(order_row.status) not in ('canceled', 'cancelled', 'unfulfillable')
  ),
  orders_daily as (
    select purchase_date::date as date,
      sum(total_amount) as revenue,
      count(*) as orders_count,
      max(source_updated_at) as source_updated_at
    from valid_orders group by purchase_date::date
  ),
  costs_by_sku as (
    select distinct on (listing.sku) listing.sku,
      coalesce(cost.printing_cost, 0) + coalesce(cost.material_cost, 0) +
      coalesce(cost.packaging_cost, 0) + coalesce(cost.shipping_cost, 0) +
      coalesce(cost.labor_cost, 0) + coalesce(cost.misc_cost, 0) as unit_cost
    from public.listings listing
    join public.cost_profiles cost
      on cost.id = listing.cost_profile_id and cost.workspace_id = p_workspace_id
    where listing.workspace_id = p_workspace_id and listing.sku is not null
    order by listing.sku, listing.updated_at desc
  ),
  items_daily as (
    select order_row.purchase_date::date as date,
      sum(greatest(coalesce(item.quantity_ordered, 0), 0)) as total_units,
      sum(greatest(coalesce(item.quantity_ordered, 0), 0)) filter (where cost.unit_cost is not null) as covered_units,
      sum(greatest(coalesce(item.quantity_ordered, 0), 0) * cost.unit_cost) filter (where cost.unit_cost is not null) as covered_cogs
    from public.order_items item
    join valid_orders order_row on order_row.id = item.order_id
    left join costs_by_sku cost on cost.sku = item.seller_sku
    where item.workspace_id = p_workspace_id
    group by order_row.purchase_date::date
  ),
  ads_daily as (
    select performance_date as date, count(*) as fact_count,
      sum(spend) as ad_spend, sum(attributed_sales) as ad_sales,
      max(synced_at) as source_updated_at
    from public.advertising_performance_daily fact
    where fact.workspace_id = p_workspace_id
      and fact.performance_date >= p_since and fact.performance_date < p_until
    group by performance_date
  ),
  ads_coverage as (
    select
      (checkpoint.cursor->>'from')::date as from_date,
      (checkpoint.cursor->>'through')::date as through_date
    from public.sync_checkpoints checkpoint
    where checkpoint.workspace_id = p_workspace_id
      and checkpoint.resource_type = 'amazon_ads_campaign_performance'
      and checkpoint.freshness_state = 'fresh'
      and checkpoint.cursor ? 'from' and checkpoint.cursor ? 'through'
      and checkpoint.cursor->>'from' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
      and checkpoint.cursor->>'through' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
  ),
  refunds_daily as (
    select processed_at::date as date, count(*) as refund_count,
      sum(amount) as refund_costs, max(updated_at) as source_updated_at
    from public.refunds refund
    where refund.workspace_id = p_workspace_id
      and refund.processed_at::date >= p_since and refund.processed_at::date < p_until
    group by processed_at::date
  ),
  refunds_coverage as (
    select
      (checkpoint.cursor->>'from')::timestamptz::date as from_date,
      (checkpoint.cursor->>'through')::timestamptz::date as through_date
    from public.sync_checkpoints checkpoint
    where checkpoint.workspace_id = p_workspace_id
      and checkpoint.resource_type = 'amazon_refunds'
      and checkpoint.freshness_state = 'fresh'
      and checkpoint.cursor ? 'from' and checkpoint.cursor ? 'through'
      and checkpoint.cursor->>'from' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
      and checkpoint.cursor->>'through' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
  ),
  dates as (
    select date from orders_daily union select date from ads_daily union select date from refunds_daily
  ),
  rows as (
    select dates.date,
      coalesce(orders.revenue, 0) as revenue,
      coalesce(orders.orders_count, 0) as orders_count,
      coalesce(items.total_units, 0) as units_sold,
      case when coalesce(items.total_units, 0) = coalesce(items.covered_units, 0)
        then coalesce(items.covered_cogs, 0) else null end as cogs,
      case when coalesce(items.total_units, 0) = 0 then 100
        else round(100.0 * coalesce(items.covered_units, 0) / items.total_units, 1) end as cogs_coverage,
      null::numeric as shipping_cost,
      null::numeric as amazon_fees,
      case when ads.fact_count > 0 or exists (
        select 1 from ads_coverage coverage
        where dates.date >= coverage.from_date and dates.date <= coverage.through_date
      ) then coalesce(ads.ad_spend, 0) else null end as ad_spend,
      case when ads.fact_count > 0 or exists (
        select 1 from ads_coverage coverage
        where dates.date >= coverage.from_date and dates.date <= coverage.through_date
      ) then coalesce(ads.ad_sales, 0) else null end as ad_sales,
      case when refunds.refund_count > 0 or exists (
        select 1 from refunds_coverage coverage
        where dates.date >= coverage.from_date and dates.date <= coverage.through_date
      ) then coalesce(refunds.refund_costs, 0) else null end as refund_costs,
      case when refunds.refund_count > 0 or exists (
        select 1 from refunds_coverage coverage
        where dates.date >= coverage.from_date and dates.date <= coverage.through_date
      ) then coalesce(refunds.refund_count, 0) else null end as refund_count,
      greatest(orders.source_updated_at, ads.source_updated_at, refunds.source_updated_at) as source_updated_at
    from dates
    left join orders_daily orders using (date)
    left join items_daily items using (date)
    left join ads_daily ads using (date)
    left join refunds_daily refunds using (date)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'date', rows.date,
    'revenue', rows.revenue,
    'ordersCount', rows.orders_count,
    'unitsSold', rows.units_sold,
    'cogs', rows.cogs,
    'cogsCoverage', rows.cogs_coverage,
    'shippingCost', rows.shipping_cost,
    'amazonFees', rows.amazon_fees,
    'adSpend', rows.ad_spend,
    'adSales', rows.ad_sales,
    'refundCosts', rows.refund_costs,
    'refundCount', rows.refund_count,
    'contributionProfit', null,
    'calculationStatus', 'incomplete',
    'sourceUpdatedAt', rows.source_updated_at,
    'limitations', jsonb_build_array(
      'Amazon fee facts are unavailable; contribution profit is not calculated.',
      'Custom operating expenses are reported separately and are not allocated to daily rows.'
    )
  ) order by rows.date desc), '[]'::jsonb)
  into result from rows;

  return result;
end;
$$;

revoke all on function public.get_workspace_financial_daily(uuid, date, date)
  from public, anon, authenticated;
grant execute on function public.get_workspace_financial_daily(uuid, date, date)
  to service_role;

create or replace function public.get_workspace_advertising_overview(
  p_workspace_id uuid,
  p_since date,
  p_until date,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with filtered as materialized (
    select * from public.advertising_performance_daily fact
    where fact.workspace_id = p_workspace_id
      and fact.performance_date between p_since and p_until
  ),
  campaign_totals as materialized (
    select
      fact.campaign_id,
      max(fact.campaign_name) as name,
      max(snapshot.status) as status,
      max(snapshot.budget) as budget,
      max(snapshot.bid_strategy) as bid_strategy,
      sum(fact.impressions) as impressions,
      sum(fact.clicks) as clicks,
      sum(fact.spend) as spend,
      sum(fact.attributed_sales) as sales,
      sum(fact.attributed_orders) as orders,
      max(fact.currency_code) as currency_code,
      max(fact.synced_at) as synced_at
    from filtered fact
    left join public.advertising_campaigns snapshot
      on snapshot.workspace_id = p_workspace_id
      and snapshot.marketplace_account_id = fact.marketplace_account_id
      and snapshot.campaign_id = fact.campaign_id
    group by fact.campaign_id
  ),
  paged as (
    select campaign_totals.*, row_number() over (order by spend desc, campaign_id asc) as sort_order
    from campaign_totals
    order by spend desc, campaign_id asc
    limit least(greatest(p_limit, 1), 100)
    offset greatest(p_offset, 0)
  ),
  daily as (
    select performance_date, sum(spend) as spend, sum(attributed_sales) as sales,
      sum(clicks) as clicks, sum(impressions) as impressions, sum(attributed_orders) as orders
    from filtered
    group by performance_date
    order by performance_date
  )
  select jsonb_build_object(
    'dataAvailable', exists(select 1 from filtered),
    'dataWindow', jsonb_build_object('since', p_since, 'until', p_until, 'timezone', 'marketplace_report_date'),
    'source', 'amazon_ads_api_v3_daily',
    'sourceUpdatedAt', (select max(synced_at) from filtered),
    'earliestAvailableDate', (select min(performance_date) from filtered),
    'latestAvailableDate', (select max(performance_date) from filtered),
    'summary', jsonb_build_object(
      'spend', coalesce((select sum(spend) from filtered), 0),
      'sales', coalesce((select sum(attributed_sales) from filtered), 0),
      'impressions', coalesce((select sum(impressions) from filtered), 0),
      'clicks', coalesce((select sum(clicks) from filtered), 0),
      'orders', coalesce((select sum(attributed_orders) from filtered), 0),
      'campaigns', (select count(*) from campaign_totals)
    ),
    'campaigns', coalesce((select jsonb_agg(to_jsonb(paged) - 'sort_order' order by sort_order) from paged), '[]'::jsonb),
    'daily', coalesce((select jsonb_agg(jsonb_build_object(
      'date', performance_date, 'spend', spend, 'sales', sales,
      'clicks', clicks, 'impressions', impressions, 'orders', orders
    ) order by performance_date) from daily), '[]'::jsonb),
    'totalCampaigns', (select count(*) from campaign_totals)
  );
$$;

revoke all on function public.get_workspace_advertising_overview(uuid, date, date, integer, integer)
  from public, anon, authenticated;
grant execute on function public.get_workspace_advertising_overview(uuid, date, date, integer, integer)
  to service_role;

create or replace function public.get_workspace_refunds_overview(
  p_workspace_id uuid,
  p_since timestamptz,
  p_until timestamptz,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with filtered as materialized (
    select refund.* from public.refunds refund
    where refund.workspace_id = p_workspace_id
      and refund.processed_at >= p_since
      and refund.processed_at < p_until
  ),
  paged as (
    select filtered.*, row_number() over (order by processed_at desc, id desc) as sort_order
    from filtered
    order by processed_at desc, id desc
    limit least(greatest(p_limit, 1), 100)
    offset greatest(p_offset, 0)
  ),
  daily as (
    select processed_at::date as date, count(*) as adjustments,
      sum(greatest(coalesce(quantity, 0), 0)) as units,
      sum(coalesce(amount, 0)) as amount
    from filtered group by processed_at::date order by processed_at::date
  ),
  top_skus as (
    select sku, sum(greatest(coalesce(quantity, 0), 0)) as units,
      count(*) as adjustments, sum(coalesce(amount, 0)) as amount
    from filtered where sku is not null
    group by sku order by amount desc, sku asc limit 5
  )
  select jsonb_build_object(
    'dataWindow', jsonb_build_object('since', p_since, 'until', p_until),
    'dataSource', 'amazon_sp_api_finances',
    'sourceUpdatedAt', (select max(updated_at) from filtered),
    'summary', jsonb_build_object(
      'adjustments', (select count(*) from filtered),
      'units', coalesce((select sum(greatest(coalesce(quantity, 0), 0)) from filtered), 0),
      'amount', coalesce((select sum(amount) from filtered), 0)
    ),
    'rows', coalesce((select jsonb_agg(to_jsonb(paged) - 'sort_order' order by sort_order) from paged), '[]'::jsonb),
    'daily', coalesce((select jsonb_agg(jsonb_build_object(
      'date', date, 'adjustments', adjustments, 'units', units, 'amount', amount
    ) order by date) from daily), '[]'::jsonb),
    'topSkus', coalesce((select jsonb_agg(jsonb_build_object(
      'sku', sku, 'adjustments', adjustments, 'units', units, 'amount', amount
    )) from top_skus), '[]'::jsonb),
    'total', (select count(*) from filtered)
  );
$$;

revoke all on function public.get_workspace_refunds_overview(uuid, timestamptz, timestamptz, integer, integer)
  from public, anon, authenticated;
grant execute on function public.get_workspace_refunds_overview(uuid, timestamptz, timestamptz, integer, integer)
  to service_role;

alter table public.expenses
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz,
  add column if not exists version bigint not null default 1;

create index if not exists idx_expenses_workspace_date_active
  on public.expenses(workspace_id, date desc)
  where deleted_at is null;

create or replace function public.get_workspace_expenses_page(
  p_workspace_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with active_expenses as materialized (
    select expense.* from public.expenses expense
    where expense.workspace_id = p_workspace_id and expense.deleted_at is null
  ),
  paged as (
    select active_expenses.*, row_number() over (order by date desc, created_at desc, id desc) as sort_order
    from active_expenses
    order by date desc, created_at desc, id desc
    limit least(greatest(p_limit, 1), 100)
    offset greatest(p_offset, 0)
  ),
  categories as (
    select category, sum(amount) as amount from active_expenses group by category order by amount desc
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(to_jsonb(paged) - 'sort_order' order by sort_order) from paged), '[]'::jsonb),
    'total', (select count(*) from active_expenses),
    'summary', jsonb_build_object(
      'total', coalesce((select sum(amount) from active_expenses), 0),
      'recurring', coalesce((select sum(amount) from active_expenses where is_recurring), 0),
      'oneOff', coalesce((select sum(amount) from active_expenses where not is_recurring), 0),
      'categories', coalesce((select jsonb_object_agg(category, amount) from categories), '{}'::jsonb)
    )
  );
$$;

create or replace function public.save_workspace_expense(
  p_workspace_id uuid,
  p_actor_id uuid,
  p_expense_id uuid,
  p_expected_version bigint,
  p_category text,
  p_amount numeric,
  p_currency text,
  p_description text,
  p_date date,
  p_is_recurring boolean,
  p_recurrence_interval text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_expense public.expenses%rowtype;
  saved_expense public.expenses%rowtype;
begin
  if length(trim(p_category)) not between 1 and 80 or p_amount <= 0 or p_amount > 9999999999.99
     or p_currency !~ '^[A-Z]{3}$' or p_date is null
     or (p_is_recurring and p_recurrence_interval not in ('daily', 'weekly', 'monthly', 'yearly'))
     or (not p_is_recurring and p_recurrence_interval is not null) then
    raise exception using errcode = '22023', message = 'Invalid expense configuration.';
  end if;

  if p_expense_id is null then
    insert into public.expenses (
      workspace_id, user_id, category, amount, currency, description, date,
      is_recurring, recurrence_interval
    ) values (
      p_workspace_id, p_actor_id, trim(p_category), p_amount, p_currency,
      nullif(trim(p_description), ''), p_date, p_is_recurring, p_recurrence_interval
    ) returning * into saved_expense;
    insert into public.audit_events (
      workspace_id, actor_type, actor_id, action, resource_type, resource_id, new_state, source
    ) values (
      p_workspace_id, 'human', p_actor_id, 'expense.created', 'expense', saved_expense.id::text,
      jsonb_build_object('category', saved_expense.category, 'amount', saved_expense.amount, 'currency', saved_expense.currency, 'date', saved_expense.date),
      'expenses_api'
    );
  else
    select * into current_expense from public.expenses
    where workspace_id = p_workspace_id and id = p_expense_id and deleted_at is null
    for update;
    if not found then raise exception using errcode = 'P0002', message = 'Expense not found.'; end if;
    if p_expected_version is null or current_expense.version <> p_expected_version then
      raise exception using errcode = '40001', message = 'Expense changed. Refresh before saving.';
    end if;
    update public.expenses set
      category = trim(p_category), amount = p_amount, currency = p_currency,
      description = nullif(trim(p_description), ''), date = p_date,
      is_recurring = p_is_recurring, recurrence_interval = p_recurrence_interval,
      updated_at = now(), version = version + 1
    where workspace_id = p_workspace_id and id = p_expense_id
    returning * into saved_expense;
    insert into public.audit_events (
      workspace_id, actor_type, actor_id, action, resource_type, resource_id,
      previous_state, new_state, source
    ) values (
      p_workspace_id, 'human', p_actor_id, 'expense.updated', 'expense', saved_expense.id::text,
      jsonb_build_object('category', current_expense.category, 'amount', current_expense.amount, 'currency', current_expense.currency, 'date', current_expense.date, 'version', current_expense.version),
      jsonb_build_object('category', saved_expense.category, 'amount', saved_expense.amount, 'currency', saved_expense.currency, 'date', saved_expense.date, 'version', saved_expense.version),
      'expenses_api'
    );
  end if;
  return to_jsonb(saved_expense);
end;
$$;

create or replace function public.delete_workspace_expense(
  p_workspace_id uuid,
  p_actor_id uuid,
  p_expense_id uuid,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_expense public.expenses%rowtype;
begin
  select * into current_expense from public.expenses
  where workspace_id = p_workspace_id and id = p_expense_id and deleted_at is null
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'Expense not found.'; end if;
  if current_expense.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'Expense changed. Refresh before deleting.';
  end if;
  update public.expenses set deleted_at = now(), updated_at = now(), version = version + 1
  where workspace_id = p_workspace_id and id = p_expense_id;
  insert into public.audit_events (
    workspace_id, actor_type, actor_id, action, resource_type, resource_id, previous_state, new_state, source
  ) values (
    p_workspace_id, 'human', p_actor_id, 'expense.deleted', 'expense', p_expense_id::text,
    jsonb_build_object('category', current_expense.category, 'amount', current_expense.amount, 'currency', current_expense.currency, 'date', current_expense.date, 'version', current_expense.version),
    jsonb_build_object('deleted', true), 'expenses_api'
  );
  return jsonb_build_object('id', p_expense_id, 'deleted', true);
end;
$$;

revoke all on function public.get_workspace_expenses_page(uuid, integer, integer)
  from public, anon, authenticated;
revoke all on function public.save_workspace_expense(uuid, uuid, uuid, bigint, text, numeric, text, text, date, boolean, text)
  from public, anon, authenticated;
revoke all on function public.delete_workspace_expense(uuid, uuid, uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.get_workspace_expenses_page(uuid, integer, integer)
  to service_role;
grant execute on function public.save_workspace_expense(uuid, uuid, uuid, bigint, text, numeric, text, text, date, boolean, text)
  to service_role;
grant execute on function public.delete_workspace_expense(uuid, uuid, uuid, bigint)
  to service_role;

alter table public.goals
  add column if not exists version bigint not null default 1,
  add column if not exists deleted_at timestamptz;

create index if not exists idx_goals_workspace_active_created
  on public.goals(workspace_id, created_at desc)
  where deleted_at is null;

create or replace function public.save_workspace_goal(
  p_workspace_id uuid,
  p_actor_id uuid,
  p_goal_id uuid,
  p_expected_version bigint,
  p_name text,
  p_description text,
  p_image_url text,
  p_target_amount numeric,
  p_current_savings numeric,
  p_deadline date,
  p_priority text,
  p_color text,
  p_category text,
  p_is_completed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_goal public.goals%rowtype;
  saved_goal public.goals%rowtype;
  effective_savings numeric;
  effective_completed boolean;
begin
  if length(trim(p_name)) not between 1 and 120 or p_target_amount <= 0
     or p_current_savings < 0 or p_current_savings > p_target_amount
     or p_priority not in ('low', 'medium', 'high', 'dream')
     or p_color not in ('indigo', 'emerald', 'amber', 'rose', 'sky', 'purple')
     or p_category not in ('purchase', 'tech', 'camera', 'vehicle', 'home', 'travel', 'other')
     or length(coalesce(p_description, '')) > 2000 or length(coalesce(p_image_url, '')) > 2000 then
    raise exception using errcode = '22023', message = 'Invalid goal configuration.';
  end if;
  effective_completed := p_is_completed or p_current_savings >= p_target_amount;
  effective_savings := case when effective_completed then p_target_amount else p_current_savings end;

  if p_goal_id is null then
    insert into public.goals (
      workspace_id, user_id, name, description, image_url, target_amount,
      current_savings, deadline, priority, color, category, is_completed, completed_at
    ) values (
      p_workspace_id, p_actor_id, trim(p_name), nullif(trim(p_description), ''),
      nullif(trim(p_image_url), ''), p_target_amount, effective_savings, p_deadline,
      p_priority, p_color, p_category, effective_completed,
      case when effective_completed then now() else null end
    ) returning * into saved_goal;
  else
    select * into current_goal from public.goals
    where workspace_id = p_workspace_id and id = p_goal_id and deleted_at is null
    for update;
    if not found then raise exception using errcode = 'P0002', message = 'Goal not found.'; end if;
    if p_expected_version is null or current_goal.version <> p_expected_version then
      raise exception using errcode = '40001', message = 'Goal changed. Refresh before saving.';
    end if;
    update public.goals set
      name = trim(p_name), description = nullif(trim(p_description), ''),
      image_url = nullif(trim(p_image_url), ''), target_amount = p_target_amount,
      current_savings = effective_savings, deadline = p_deadline, priority = p_priority,
      color = p_color, category = p_category, is_completed = effective_completed,
      completed_at = case
        when effective_completed and current_goal.completed_at is null then now()
        when not effective_completed then null else current_goal.completed_at end,
      updated_at = now(), version = version + 1
    where workspace_id = p_workspace_id and id = p_goal_id
    returning * into saved_goal;
  end if;

  insert into public.audit_events (
    workspace_id, actor_type, actor_id, action, resource_type, resource_id,
    previous_state, new_state, source
  ) values (
    p_workspace_id, 'human', p_actor_id,
    case when p_goal_id is null then 'goal.created' else 'goal.updated' end,
    'goal', saved_goal.id::text,
    case when p_goal_id is null then null else jsonb_build_object(
      'name', current_goal.name, 'target_amount', current_goal.target_amount,
      'current_savings', current_goal.current_savings, 'is_completed', current_goal.is_completed,
      'version', current_goal.version
    ) end,
    jsonb_build_object(
      'name', saved_goal.name, 'target_amount', saved_goal.target_amount,
      'current_savings', saved_goal.current_savings, 'is_completed', saved_goal.is_completed,
      'version', saved_goal.version
    ),
    'goals_api'
  );
  return to_jsonb(saved_goal);
end;
$$;

create or replace function public.delete_workspace_goal(
  p_workspace_id uuid,
  p_actor_id uuid,
  p_goal_id uuid,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_goal public.goals%rowtype;
begin
  select * into current_goal from public.goals
  where workspace_id = p_workspace_id and id = p_goal_id and deleted_at is null
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'Goal not found.'; end if;
  if current_goal.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'Goal changed. Refresh before deleting.';
  end if;
  update public.goals set deleted_at = now(), updated_at = now(), version = version + 1
  where workspace_id = p_workspace_id and id = p_goal_id;
  insert into public.audit_events (
    workspace_id, actor_type, actor_id, action, resource_type, resource_id, previous_state, new_state, source
  ) values (
    p_workspace_id, 'human', p_actor_id, 'goal.deleted', 'goal', p_goal_id::text,
    jsonb_build_object('name', current_goal.name, 'target_amount', current_goal.target_amount, 'current_savings', current_goal.current_savings, 'version', current_goal.version),
    jsonb_build_object('deleted', true), 'goals_api'
  );
  return jsonb_build_object('id', p_goal_id, 'deleted', true);
end;
$$;

revoke all on function public.save_workspace_goal(uuid, uuid, uuid, bigint, text, text, text, numeric, numeric, date, text, text, text, boolean)
  from public, anon, authenticated;
revoke all on function public.delete_workspace_goal(uuid, uuid, uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.save_workspace_goal(uuid, uuid, uuid, bigint, text, text, text, numeric, numeric, date, text, text, text, boolean)
  to service_role;
grant execute on function public.delete_workspace_goal(uuid, uuid, uuid, bigint)
  to service_role;

create or replace function public.get_workspace_ai_usage_summary(
  p_workspace_id uuid,
  p_since timestamptz
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'totalCostMicros', coalesce(sum(usage.cost_micros), 0),
    'costCoverageComplete', count(*) filter (where usage.status = 'succeeded' and usage.cost_status = 'unknown') = 0,
    'unknownCostRequests', count(*) filter (where usage.status = 'succeeded' and usage.cost_status = 'unknown'),
    'totalInputTokens', coalesce(sum(usage.input_tokens), 0),
    'totalOutputTokens', coalesce(sum(usage.output_tokens), 0),
    'totalRequests', count(*),
    'failedRequests', count(*) filter (where usage.status = 'failed'),
    'byProvider', coalesce((
      select jsonb_agg(provider_totals order by provider_totals."costMicros" desc)
      from (
        select
          provider,
          model,
          sum(cost_micros) as "costMicros",
          sum(input_tokens) as "inputTokens",
          sum(output_tokens) as "outputTokens",
          count(*) as requests
        from public.ai_usage_records
        where workspace_id = p_workspace_id and created_at >= p_since
        group by provider, model
      ) provider_totals
    ), '[]'::jsonb),
    'byFeature', coalesce((
      select jsonb_agg(feature_totals order by feature_totals."costMicros" desc)
      from (
        select feature, sum(cost_micros) as "costMicros", count(*) as requests
        from public.ai_usage_records
        where workspace_id = p_workspace_id and created_at >= p_since
        group by feature
      ) feature_totals
    ), '[]'::jsonb)
  )
  from public.ai_usage_records usage
  where usage.workspace_id = p_workspace_id and usage.created_at >= p_since;
$$;

revoke all on function public.get_workspace_ai_usage_summary(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.get_workspace_ai_usage_summary(uuid, timestamptz)
  to service_role;

create or replace function public.reserve_workspace_ai_budget(
  p_workspace_id uuid,
  p_correlation_id text,
  p_estimated_cost_micros bigint,
  p_estimated_tokens bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  policy_row public.ai_budget_policies%rowtype;
  daily_cost bigint;
  monthly_cost bigint;
  daily_tokens bigint;
  monthly_tokens bigint;
  reserved_daily_cost bigint;
  reserved_monthly_cost bigint;
  reserved_daily_tokens bigint;
  reserved_monthly_tokens bigint;
begin
  if p_correlation_id is null or length(trim(p_correlation_id)) < 8 then
    raise exception 'A valid AI request correlation ID is required.';
  end if;
  if p_estimated_tokens is null or p_estimated_tokens < 0 then
    raise exception 'Estimated AI tokens must be non-negative.';
  end if;
  if p_estimated_cost_micros is not null and p_estimated_cost_micros < 0 then
    raise exception 'Estimated AI cost must be non-negative.';
  end if;

  select * into policy_row from public.ai_budget_policies
  where workspace_id = p_workspace_id for update;
  if not found then
    return jsonb_build_object('allowed', true, 'policyConfigured', false, 'reservationCreated', false);
  end if;

  update public.ai_budget_reservations
  set status = 'expired', updated_at = now()
  where workspace_id = p_workspace_id and status = 'reserved' and expires_at <= now();

  if policy_row.require_known_cost and
     (policy_row.daily_cost_limit_micros is not null or policy_row.monthly_cost_limit_micros is not null) and
     p_estimated_cost_micros is null then
    return jsonb_build_object(
      'allowed', false,
      'policyConfigured', true,
      'code', 'AI_COST_UNKNOWN',
      'reason', 'This model has no configured token pricing, so SellerPlus cannot safely enforce the workspace monetary budget.'
    );
  end if;

  select coalesce(sum(cost_micros), 0),
         coalesce(sum(input_tokens + output_tokens), 0)
  into daily_cost, daily_tokens
  from public.ai_usage_records
  where workspace_id = p_workspace_id and status = 'succeeded'
    and created_at >= date_trunc('day', now());

  select coalesce(sum(cost_micros), 0),
         coalesce(sum(input_tokens + output_tokens), 0)
  into monthly_cost, monthly_tokens
  from public.ai_usage_records
  where workspace_id = p_workspace_id and status = 'succeeded'
    and created_at >= date_trunc('month', now());

  select
    coalesce(sum(estimated_cost_micros) filter (where created_at >= date_trunc('day', now())), 0),
    coalesce(sum(estimated_cost_micros) filter (where created_at >= date_trunc('month', now())), 0),
    coalesce(sum(estimated_tokens) filter (where created_at >= date_trunc('day', now())), 0),
    coalesce(sum(estimated_tokens) filter (where created_at >= date_trunc('month', now())), 0)
  into reserved_daily_cost, reserved_monthly_cost, reserved_daily_tokens, reserved_monthly_tokens
  from public.ai_budget_reservations
  where workspace_id = p_workspace_id and status = 'reserved' and expires_at > now();

  if policy_row.daily_cost_limit_micros is not null and
     daily_cost + reserved_daily_cost + coalesce(p_estimated_cost_micros, 0) > policy_row.daily_cost_limit_micros then
    return jsonb_build_object('allowed', false, 'policyConfigured', true, 'code', 'AI_DAILY_COST_LIMIT', 'reason', 'The workspace daily AI budget has been reached.');
  end if;
  if policy_row.monthly_cost_limit_micros is not null and
     monthly_cost + reserved_monthly_cost + coalesce(p_estimated_cost_micros, 0) > policy_row.monthly_cost_limit_micros then
    return jsonb_build_object('allowed', false, 'policyConfigured', true, 'code', 'AI_MONTHLY_COST_LIMIT', 'reason', 'The workspace monthly AI budget has been reached.');
  end if;
  if policy_row.daily_token_limit is not null and
     daily_tokens + reserved_daily_tokens + p_estimated_tokens > policy_row.daily_token_limit then
    return jsonb_build_object('allowed', false, 'policyConfigured', true, 'code', 'AI_DAILY_TOKEN_LIMIT', 'reason', 'The workspace daily AI token limit has been reached.');
  end if;
  if policy_row.monthly_token_limit is not null and
     monthly_tokens + reserved_monthly_tokens + p_estimated_tokens > policy_row.monthly_token_limit then
    return jsonb_build_object('allowed', false, 'policyConfigured', true, 'code', 'AI_MONTHLY_TOKEN_LIMIT', 'reason', 'The workspace monthly AI token limit has been reached.');
  end if;

  insert into public.ai_budget_reservations (
    workspace_id, correlation_id, estimated_cost_micros, estimated_tokens,
    status, expires_at, updated_at
  ) values (
    p_workspace_id, p_correlation_id, p_estimated_cost_micros, p_estimated_tokens,
    'reserved', now() + interval '10 minutes', now()
  )
  on conflict (workspace_id, correlation_id) do update
    set estimated_cost_micros = excluded.estimated_cost_micros,
        estimated_tokens = excluded.estimated_tokens,
        status = 'reserved', expires_at = excluded.expires_at, updated_at = now()
    where public.ai_budget_reservations.status in ('released', 'expired');

  return jsonb_build_object(
    'allowed', true,
    'policyConfigured', true,
    'reservationCreated', true,
    'dailyCostMicros', daily_cost + reserved_daily_cost,
    'monthlyCostMicros', monthly_cost + reserved_monthly_cost,
    'dailyTokens', daily_tokens + reserved_daily_tokens,
    'monthlyTokens', monthly_tokens + reserved_monthly_tokens
  );
end;
$$;

create or replace function public.record_workspace_ai_usage(
  p_workspace_id uuid,
  p_user_id uuid,
  p_feature text,
  p_provider text,
  p_model text,
  p_input_tokens bigint,
  p_output_tokens bigint,
  p_cost_micros bigint,
  p_cost_status text,
  p_latency_ms integer,
  p_status text,
  p_correlation_id text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  usage_id uuid;
begin
  if p_status not in ('succeeded', 'failed', 'cached', 'blocked') then
    raise exception 'Invalid AI usage status.';
  end if;
  if p_cost_status not in ('provider_reported', 'configured_estimate', 'not_applicable', 'unknown') then
    raise exception 'Invalid AI cost status.';
  end if;

  insert into public.ai_usage_records (
    workspace_id, user_id, feature, provider, model, input_tokens, output_tokens,
    cost_micros, cost_status, latency_ms, status, correlation_id
  ) values (
    p_workspace_id, p_user_id, p_feature, p_provider, p_model,
    greatest(coalesce(p_input_tokens, 0), 0), greatest(coalesce(p_output_tokens, 0), 0),
    case when p_cost_status = 'unknown' then null else greatest(coalesce(p_cost_micros, 0), 0) end,
    p_cost_status, greatest(coalesce(p_latency_ms, 0), 0), p_status, p_correlation_id
  ) returning id into usage_id;

  update public.ai_budget_reservations
  set status = case when p_status = 'succeeded' then 'settled' else 'released' end,
      updated_at = now()
  where workspace_id = p_workspace_id and correlation_id = p_correlation_id and status = 'reserved';

  return usage_id;
end;
$$;

create or replace function public.save_workspace_ai_budget_policy(
  p_workspace_id uuid,
  p_actor_id uuid,
  p_expected_version bigint,
  p_enabled boolean,
  p_daily_cost_limit_micros bigint,
  p_monthly_cost_limit_micros bigint,
  p_daily_token_limit bigint,
  p_monthly_token_limit bigint,
  p_require_known_cost boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_policy public.ai_budget_policies%rowtype;
  saved_policy public.ai_budget_policies%rowtype;
begin
  select * into current_policy from public.ai_budget_policies
  where workspace_id = p_workspace_id for update;

  if found and current_policy.version <> coalesce(p_expected_version, -1) then
    raise exception using errcode = '40001', message = 'AI budget policy changed. Refresh before saving.';
  end if;
  if not found and p_expected_version is not null then
    raise exception using errcode = '40001', message = 'AI budget policy changed. Refresh before saving.';
  end if;

  if not p_enabled then
    delete from public.ai_budget_policies where workspace_id = p_workspace_id;
    insert into public.audit_events (
      workspace_id, actor_type, actor_id, action, resource_type, resource_id,
      previous_state, new_state, source
    ) values (
      p_workspace_id, 'human', p_actor_id, 'ai_budget.disabled', 'ai_budget_policy', p_workspace_id::text,
      case when current_policy.workspace_id is null then null else to_jsonb(current_policy) - 'updated_by' end,
      jsonb_build_object('enabled', false), 'settings'
    );
    return jsonb_build_object('enabled', false, 'version', null);
  end if;

  if p_daily_cost_limit_micros is null and p_monthly_cost_limit_micros is null and
     p_daily_token_limit is null and p_monthly_token_limit is null then
    raise exception 'At least one AI budget limit is required.';
  end if;

  insert into public.ai_budget_policies (
    workspace_id, daily_cost_limit_micros, monthly_cost_limit_micros,
    daily_token_limit, monthly_token_limit, require_known_cost, version, updated_by, updated_at
  ) values (
    p_workspace_id, p_daily_cost_limit_micros, p_monthly_cost_limit_micros,
    p_daily_token_limit, p_monthly_token_limit, p_require_known_cost, 1, p_actor_id, now()
  )
  on conflict (workspace_id) do update
    set daily_cost_limit_micros = excluded.daily_cost_limit_micros,
        monthly_cost_limit_micros = excluded.monthly_cost_limit_micros,
        daily_token_limit = excluded.daily_token_limit,
        monthly_token_limit = excluded.monthly_token_limit,
        require_known_cost = excluded.require_known_cost,
        version = public.ai_budget_policies.version + 1,
        updated_by = excluded.updated_by,
        updated_at = now()
  returning * into saved_policy;

  insert into public.audit_events (
    workspace_id, actor_type, actor_id, action, resource_type, resource_id,
    previous_state, new_state, source
  ) values (
    p_workspace_id, 'human', p_actor_id, 'ai_budget.updated', 'ai_budget_policy', p_workspace_id::text,
    case when current_policy.workspace_id is null then null else to_jsonb(current_policy) - 'updated_by' end,
    to_jsonb(saved_policy) - 'updated_by', 'settings'
  );
  return jsonb_build_object(
    'enabled', true,
    'version', saved_policy.version,
    'dailyCostLimitMicros', saved_policy.daily_cost_limit_micros,
    'monthlyCostLimitMicros', saved_policy.monthly_cost_limit_micros,
    'dailyTokenLimit', saved_policy.daily_token_limit,
    'monthlyTokenLimit', saved_policy.monthly_token_limit,
    'requireKnownCost', saved_policy.require_known_cost
  );
end;
$$;

revoke all on function public.reserve_workspace_ai_budget(uuid, text, bigint, bigint)
  from public, anon, authenticated;
revoke all on function public.record_workspace_ai_usage(uuid, uuid, text, text, text, bigint, bigint, bigint, text, integer, text, text)
  from public, anon, authenticated;
revoke all on function public.save_workspace_ai_budget_policy(uuid, uuid, bigint, boolean, bigint, bigint, bigint, bigint, boolean)
  from public, anon, authenticated;
grant execute on function public.reserve_workspace_ai_budget(uuid, text, bigint, bigint)
  to service_role;
grant execute on function public.record_workspace_ai_usage(uuid, uuid, text, text, text, bigint, bigint, bigint, text, integer, text, text)
  to service_role;
grant execute on function public.save_workspace_ai_budget_policy(uuid, uuid, bigint, boolean, bigint, bigint, bigint, bigint, boolean)
  to service_role;

-- Resolve a human approval and create the resulting safe analysis job in the
-- same transaction. External marketplace mutations are deliberately not
-- supported here; each such action needs a separately registered deterministic
-- executor and policy implementation.
create or replace function public.decide_action_proposal(
  p_workspace_id uuid,
  p_proposal_id uuid,
  p_actor_id uuid,
  p_decision text,
  p_expected_version bigint,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  proposal public.action_proposals%rowtype;
  analysis_job_type text;
  analysis_mode text;
  analysis_goal text;
  queued_job_id uuid;
begin
  if p_decision not in ('approve', 'reject') then
    raise exception using errcode = '22023', message = 'Unsupported proposal decision.';
  end if;

  select * into proposal
  from public.action_proposals
  where id = p_proposal_id
    and workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Action proposal was not found.';
  end if;
  if proposal.status <> 'approval_required' then
    raise exception using errcode = '40001', message = 'Action proposal is no longer awaiting approval.';
  end if;
  if proposal.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'Action proposal changed. Refresh before deciding.';
  end if;
  if proposal.expires_at is not null and proposal.expires_at <= now() then
    raise exception using errcode = '22023', message = 'Action proposal has expired.';
  end if;

  if p_decision = 'approve' then
    case proposal.action_type
      when 'analyze_ppc' then
        analysis_job_type := 'audit_ads';
        analysis_mode := 'Advertising Audit';
        analysis_goal := 'REDUCE_ACOS';
      when 'review_inventory' then
        analysis_job_type := 'check_inventory';
        analysis_mode := 'Inventory Audit';
        analysis_goal := 'PREVENT_STOCKOUT';
      when 'review_pricing' then
        analysis_job_type := 'bi_analysis';
        analysis_mode := 'Store Audit';
        analysis_goal := 'MAXIMIZE_PROFIT';
      when 'create_cost_profile', 'assign_cost_profile', 'update_cost_profile' then
        analysis_job_type := 'apply_cost_change';
      else
        raise exception using errcode = '0A000', message = 'No deterministic executor is registered for this action type.';
    end case;

    update public.action_proposals
    set status = 'approved',
        approved_by = p_actor_id,
        approved_at = now(),
        updated_at = now(),
        version = version + 1
    where id = proposal.id;

    insert into public.jobs (
      job_type, idempotency_key, payload, priority, status, run_at,
      attempts, max_attempts, user_id, workspace_id
    ) values (
      analysis_job_type,
      'proposal:' || proposal.id::text || case
        when analysis_job_type = 'apply_cost_change' then ':execution'
        else ':analysis'
      end,
      case
        when analysis_job_type = 'apply_cost_change' then jsonb_build_object(
          'proposalId', proposal.id,
          'approvedBy', p_actor_id
        )
        else jsonb_build_object(
          'mode', analysis_mode,
          'goal', analysis_goal,
          'customPrompt', proposal.proposed_state ->> 'sellerRequest',
          'proposalId', proposal.id,
          'approvedBy', p_actor_id
        )
      end,
      3,
      'queued',
      now(),
      0,
      3,
      p_actor_id,
      p_workspace_id
    )
    on conflict (workspace_id, idempotency_key) where idempotency_key is not null
    do update set updated_at = excluded.updated_at
    returning id into queued_job_id;
  else
    update public.action_proposals
    set status = 'rejected',
        rejected_reason = nullif(trim(p_reason), ''),
        updated_at = now(),
        version = version + 1
    where id = proposal.id;
  end if;

  insert into public.audit_events (
    workspace_id, actor_type, actor_id, action, resource_type, resource_id,
    previous_state, new_state, source, correlation_id
  ) values (
    p_workspace_id,
    'human',
    p_actor_id::text,
    'ai_action.' || case when p_decision = 'approve' then 'approved' else 'rejected' end,
    'action_proposal',
    proposal.id::text,
    jsonb_build_object('status', proposal.status, 'version', proposal.version),
    jsonb_build_object(
      'status', case when p_decision = 'approve' then 'approved' else 'rejected' end,
      'version', proposal.version + 1,
      'reason', nullif(trim(p_reason), ''),
      'jobId', queued_job_id
    ),
    'approval_center',
    proposal.id::text
  );

  return jsonb_build_object(
    'proposalId', proposal.id,
    'status', case when p_decision = 'approve' then 'approved' else 'rejected' end,
    'version', proposal.version + 1,
    'jobId', queued_job_id
  );
end;
$$;

revoke all on function public.decide_action_proposal(uuid, uuid, uuid, text, bigint, text)
  from public, anon, authenticated;
grant execute on function public.decide_action_proposal(uuid, uuid, uuid, text, bigint, text)
  to service_role;

create or replace function public.execute_cost_change_proposal(
  p_workspace_id uuid,
  p_proposal_id uuid,
  p_executor_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  proposal public.action_proposals%rowtype;
  prior_execution public.action_executions%rowtype;
  execution_id uuid;
  result_document jsonb;
  profile_id uuid;
  listing_id uuid;
  owner_id uuid;
  cost_field text;
  cost_value numeric;
  profile_name text;
  costs jsonb;
begin
  select * into prior_execution
  from public.action_executions
  where workspace_id = p_workspace_id
    and idempotency_key = 'cost-proposal:' || p_proposal_id::text;

  if found and prior_execution.status = 'succeeded' then
    return prior_execution.result;
  end if;

  select * into proposal
  from public.action_proposals
  where id = p_proposal_id and workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Cost proposal was not found.';
  end if;
  if proposal.status <> 'approved' then
    raise exception using errcode = '55000', message = 'Cost proposal is not approved for execution.';
  end if;
  if proposal.action_type not in ('create_cost_profile', 'assign_cost_profile', 'update_cost_profile') then
    raise exception using errcode = '0A000', message = 'Proposal is not a supported cost action.';
  end if;

  insert into public.action_executions (
    workspace_id, proposal_id, idempotency_key, executor_type, executor_id,
    status, started_at
  ) values (
    p_workspace_id, proposal.id, 'cost-proposal:' || proposal.id::text,
    'system', p_executor_id, 'running', now()
  )
  on conflict (workspace_id, idempotency_key) do update
    set status = 'running', executor_id = excluded.executor_id, started_at = now(),
        error_code = null, error_message = null
  returning id into execution_id;

  if proposal.action_type = 'create_cost_profile' then
    owner_id := (proposal.proposed_state ->> 'ownerId')::uuid;
    profile_name := trim(proposal.proposed_state ->> 'name');
    costs := proposal.proposed_state -> 'costs';
    if owner_id is null or profile_name = '' or costs is null then
      raise exception using errcode = '22023', message = 'Cost profile proposal is incomplete.';
    end if;

    insert into public.cost_profiles (
      workspace_id, user_id, name, printing_cost, material_cost,
      packaging_cost, shipping_cost, labor_cost, misc_cost
    ) values (
      p_workspace_id, owner_id, profile_name,
      coalesce((costs ->> 'printingCost')::numeric, 0),
      coalesce((costs ->> 'materialCost')::numeric, 0),
      coalesce((costs ->> 'packagingCost')::numeric, 0),
      coalesce((costs ->> 'shippingCost')::numeric, 0),
      coalesce((costs ->> 'laborCost')::numeric, 0),
      coalesce((costs ->> 'miscCost')::numeric, 0)
    ) returning id into profile_id;
    result_document := jsonb_build_object('profileId', profile_id, 'name', profile_name);

  elsif proposal.action_type = 'assign_cost_profile' then
    listing_id := (proposal.proposed_state ->> 'listingId')::uuid;
    profile_id := (proposal.proposed_state ->> 'profileId')::uuid;
    if not exists (
      select 1 from public.cost_profiles cp
      where cp.id = profile_id and cp.workspace_id = p_workspace_id
    ) then
      raise exception using errcode = 'P0002', message = 'Cost profile was not found in this workspace.';
    end if;
    update public.listings
    set cost_profile_id = profile_id, updated_at = now()
    where id = listing_id and workspace_id = p_workspace_id;
    if not found then
      raise exception using errcode = 'P0002', message = 'Listing was not found in this workspace.';
    end if;
    result_document := jsonb_build_object('listingId', listing_id, 'profileId', profile_id);

  else
    profile_id := (proposal.proposed_state ->> 'profileId')::uuid;
    cost_field := proposal.proposed_state ->> 'costType';
    cost_value := (proposal.proposed_state ->> 'value')::numeric;
    if cost_value < 0 or cost_value > 10000000 then
      raise exception using errcode = '22023', message = 'Cost value is outside the allowed range.';
    end if;
    if cost_field not in ('printing_cost', 'material_cost', 'packaging_cost', 'shipping_cost', 'labor_cost', 'misc_cost') then
      raise exception using errcode = '22023', message = 'Unsupported cost field.';
    end if;

    update public.cost_profiles cp
    set printing_cost = case when cost_field = 'printing_cost' then cost_value else cp.printing_cost end,
        material_cost = case when cost_field = 'material_cost' then cost_value else cp.material_cost end,
        packaging_cost = case when cost_field = 'packaging_cost' then cost_value else cp.packaging_cost end,
        shipping_cost = case when cost_field = 'shipping_cost' then cost_value else cp.shipping_cost end,
        labor_cost = case when cost_field = 'labor_cost' then cost_value else cp.labor_cost end,
        misc_cost = case when cost_field = 'misc_cost' then cost_value else cp.misc_cost end
    where cp.id = profile_id and cp.workspace_id = p_workspace_id;
    if not found then
      raise exception using errcode = 'P0002', message = 'Cost profile was not found in this workspace.';
    end if;
    result_document := jsonb_build_object(
      'profileId', profile_id, 'costType', cost_field, 'value', cost_value
    );
  end if;

  update public.action_proposals
  set status = 'executed', updated_at = now(), version = version + 1
  where id = proposal.id;

  update public.action_executions
  set status = 'succeeded', result = result_document, completed_at = now()
  where id = execution_id;

  insert into public.audit_events (
    workspace_id, actor_type, actor_id, action, resource_type, resource_id,
    previous_state, new_state, source, correlation_id
  ) values (
    p_workspace_id, 'system', p_executor_id, 'cost_change.executed',
    proposal.resource_type, proposal.resource_id, proposal.current_state,
    result_document, 'deterministic_executor', proposal.id::text
  );

  return result_document;
end;
$$;

revoke all on function public.execute_cost_change_proposal(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.execute_cost_change_proposal(uuid, uuid, text)
  to service_role;

create or replace function public.get_workspace_usage_summary(
  p_workspace_id uuid,
  p_period_start timestamptz
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'periodStart', p_period_start,
    'aiRequests', (
      select count(*) from public.ai_usage_records usage
      where usage.workspace_id = p_workspace_id and usage.created_at >= p_period_start
    ),
    'inputTokens', (
      select coalesce(sum(usage.input_tokens), 0) from public.ai_usage_records usage
      where usage.workspace_id = p_workspace_id and usage.created_at >= p_period_start
    ),
    'outputTokens', (
      select coalesce(sum(usage.output_tokens), 0) from public.ai_usage_records usage
      where usage.workspace_id = p_workspace_id and usage.created_at >= p_period_start
    ),
    'aiCostMicros', (
      select coalesce(sum(usage.cost_micros), 0) from public.ai_usage_records usage
      where usage.workspace_id = p_workspace_id and usage.created_at >= p_period_start
    ),
    'aiCostCoverageComplete', (
      select count(*) filter (where usage.status = 'succeeded' and usage.cost_status = 'unknown') = 0
      from public.ai_usage_records usage
      where usage.workspace_id = p_workspace_id and usage.created_at >= p_period_start
    ),
    'aiUnknownCostRequests', (
      select count(*) filter (where usage.status = 'succeeded' and usage.cost_status = 'unknown')
      from public.ai_usage_records usage
      where usage.workspace_id = p_workspace_id and usage.created_at >= p_period_start
    ),
    'jobs', (
      select count(*) from public.jobs job
      where job.workspace_id = p_workspace_id and job.created_at >= p_period_start
    ),
    'generatedAssets', (
      select count(*) from public.file_assets asset
      where asset.workspace_id = p_workspace_id
        and asset.source_type = 'generated'
        and asset.created_at >= p_period_start
    ),
    'storageBytes', (
      select coalesce(sum(asset.byte_size), 0) from public.file_assets asset
      where asset.workspace_id = p_workspace_id and asset.approval_state <> 'archived'
    ),
    'marketplaceAccounts', (
      select count(*) from public.marketplace_accounts account
      where account.workspace_id = p_workspace_id and account.status <> 'revoked'
    ),
    'users', (
      select count(*) from public.workspace_members member
      where member.workspace_id = p_workspace_id
    )
  );
$$;

revoke all on function public.get_workspace_usage_summary(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.get_workspace_usage_summary(uuid, timestamptz)
  to service_role;

create or replace function public.get_workspace_listing_counts(p_workspace_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'all', count(*),
    'active', count(*) filter (where listing.status = 'active'),
    'inactive', count(*) filter (where listing.status = 'inactive'),
    'draft', count(*) filter (where listing.status = 'draft'),
    'suppressed', count(*) filter (where listing.status = 'suppressed'),
    'winners', count(*) filter (where listing.performance_category = 'winner'),
    'trending', count(*) filter (where listing.performance_category = 'trending'),
    'profitable', count(*) filter (where listing.performance_category = 'profitable'),
    'declining', count(*) filter (where listing.performance_category = 'declining'),
    'dead', count(*) filter (where listing.performance_category = 'dead'),
    'low_stock', count(*) filter (where listing.performance_category = 'low_stock'),
    'out_of_stock', count(*) filter (where listing.available_qty = 0)
  )
  from public.listings listing
  where listing.workspace_id = p_workspace_id;
$$;

revoke all on function public.get_workspace_listing_counts(uuid)
  from public, anon, authenticated;
grant execute on function public.get_workspace_listing_counts(uuid)
  to service_role;

create or replace function public.get_workspace_orders_page(
  p_workspace_id uuid,
  p_limit integer,
  p_offset integer,
  p_search text default null,
  p_status text default null,
  p_marketplace text default null,
  p_start timestamptz default null,
  p_end timestamptz default null,
  p_sort text default 'purchase_date',
  p_ascending boolean default false
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with filtered as materialized (
    select
      order_row.id, order_row.channel_order_id, order_row.status,
      order_row.total_amount, order_row.currency, order_row.purchase_date,
      order_row.last_update_date, order_row.fulfillment_channel,
      order_row.marketplace_id, order_row.customer_name as buyer_name,
      order_row.shipping_address, order_row.number_of_items_shipped,
      order_row.number_of_items_unshipped, order_row.net_profit,
      order_row.gross_profit, order_row.commission_fees, order_row.fba_fees,
      order_row.shipping_cost, order_row.notes, order_row.version,
      order_row.profit_calculation_status, order_row.data_source,
      order_row.created_at, order_row.updated_at
    from public.orders order_row
    where order_row.workspace_id = p_workspace_id
      and (p_status is null or lower(order_row.status) = lower(p_status))
      and (p_marketplace is null or order_row.marketplace_id = p_marketplace)
      and (p_start is null or order_row.purchase_date >= p_start)
      and (p_end is null or order_row.purchase_date <= p_end)
      and (
        p_search is null
        or order_row.channel_order_id ilike '%' || p_search || '%'
        or exists (
          select 1 from public.order_items item
          where item.workspace_id = p_workspace_id
            and item.order_id = order_row.id
            and (
              item.seller_sku ilike '%' || p_search || '%'
              or item.asin ilike '%' || p_search || '%'
              or item.title ilike '%' || p_search || '%'
            )
        )
      )
  ),
  paged as (
    select filtered.*, row_number() over (order by
      case when p_sort = 'purchase_date' and p_ascending then purchase_date end asc nulls last,
      case when p_sort = 'purchase_date' and not p_ascending then purchase_date end desc nulls last,
      case when p_sort = 'total_amount' and p_ascending then total_amount end asc,
      case when p_sort = 'total_amount' and not p_ascending then total_amount end desc,
      id desc
    ) as sort_order
    from filtered
    order by
      case when p_sort = 'purchase_date' and p_ascending then purchase_date end asc nulls last,
      case when p_sort = 'purchase_date' and not p_ascending then purchase_date end desc nulls last,
      case when p_sort = 'total_amount' and p_ascending then total_amount end asc,
      case when p_sort = 'total_amount' and not p_ascending then total_amount end desc,
      id desc
    limit least(greatest(p_limit, 1), 100)
    offset greatest(p_offset, 0)
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(to_jsonb(paged) - 'sort_order' order by sort_order) from paged), '[]'::jsonb),
    'total', (select count(*) from filtered)
  );
$$;

revoke all on function public.get_workspace_orders_page(uuid, integer, integer, text, text, text, timestamptz, timestamptz, text, boolean)
  from public, anon, authenticated;
grant execute on function public.get_workspace_orders_page(uuid, integer, integer, text, text, text, timestamptz, timestamptz, text, boolean)
  to service_role;

create or replace function public.get_workspace_order_analytics(
  p_workspace_id uuid,
  p_start timestamptz,
  p_end timestamptz
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with all_orders as materialized (
    select * from public.orders order_row
    where order_row.workspace_id = p_workspace_id
      and order_row.purchase_date >= p_start
      and order_row.purchase_date <= p_end
  ),
  valid_orders as materialized (
    select * from all_orders
    where lower(status) not in ('canceled', 'cancelled')
  ),
  top_skus as (
    select
      coalesce(item.seller_sku, 'Unknown') as sku,
      coalesce(max(item.title), coalesce(item.seller_sku, 'Unknown')) as title,
      sum(greatest(coalesce(item.quantity_ordered, 0), 0)) as units_sold,
      sum(coalesce(item.item_price, 0)) as revenue
    from public.order_items item
    join valid_orders order_row on order_row.id = item.order_id
    where item.workspace_id = p_workspace_id
    group by coalesce(item.seller_sku, 'Unknown')
    order by units_sold desc, sku asc
    limit 10
  ),
  daily as (
    select
      day_value::date as date,
      count(order_row.id) as orders,
      coalesce(sum(order_row.total_amount), 0) as revenue,
      case when count(order_row.id) filter (where order_row.profit_calculation_status = 'complete') = count(order_row.id)
        and count(order_row.id) > 0
        then sum(order_row.net_profit)
        else null
      end as profit
    from generate_series((p_end::date - 6), p_end::date, interval '1 day') day_value
    left join valid_orders order_row on order_row.purchase_date::date = day_value::date
    group by day_value::date
    order by day_value::date
  )
  select jsonb_build_object(
    'totalRevenue', coalesce((select sum(total_amount) from valid_orders), 0),
    'totalProfit', case
      when (select count(*) from valid_orders) > 0
        and (select count(*) from valid_orders where profit_calculation_status = 'complete') = (select count(*) from valid_orders)
      then (select coalesce(sum(net_profit), 0) from valid_orders)
      else null
    end,
    'profitCoverage', case when (select count(*) from valid_orders) = 0 then 0 else
      round(100.0 * (select count(*) from valid_orders where profit_calculation_status = 'complete') / (select count(*) from valid_orders), 1)
    end,
    'totalOrders', (select count(*) from all_orders),
    'totalUnitsSold', coalesce((
      select sum(greatest(coalesce(item.quantity_ordered, 0), 0))
      from public.order_items item join valid_orders order_row on order_row.id = item.order_id
      where item.workspace_id = p_workspace_id
    ), 0),
    'averageOrderValue', case when (select count(*) from valid_orders) = 0 then 0 else
      (select coalesce(sum(total_amount), 0) / count(*) from valid_orders)
    end,
    'pendingShipments', (select count(*) from all_orders where lower(status) in ('unshipped', 'pending', 'pendingavailability', 'invoiceunconfirmed')),
    'cancelledOrders', (select count(*) from all_orders where lower(status) in ('canceled', 'cancelled')),
    'cancelledRevenue', coalesce((select sum(total_amount) from all_orders where lower(status) in ('canceled', 'cancelled')), 0),
    'shippedOrders', (select count(*) from all_orders where lower(status) in ('shipped', 'delivered', 'partiallyshipped')),
    'topSellingSkus', coalesce((select jsonb_agg(jsonb_build_object('sku', sku, 'title', title, 'unitsSold', units_sold, 'revenue', revenue)) from top_skus), '[]'::jsonb),
    'ordersPerDay', coalesce((select jsonb_agg(jsonb_build_object('date', date, 'orders', orders, 'revenue', revenue, 'profit', profit) order by date) from daily), '[]'::jsonb)
  );
$$;

revoke all on function public.get_workspace_order_analytics(uuid, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.get_workspace_order_analytics(uuid, timestamptz, timestamptz)
  to service_role;

create or replace function public.update_workspace_order_notes(
  p_workspace_id uuid,
  p_order_id uuid,
  p_actor_id uuid,
  p_expected_version bigint,
  p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_order public.orders%rowtype;
  updated_order public.orders%rowtype;
begin
  if length(coalesce(p_notes, '')) > 5000 then
    raise exception using errcode = '22023', message = 'Order notes exceed the maximum length.';
  end if;

  select * into current_order from public.orders
  where workspace_id = p_workspace_id and id = p_order_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Order not found.';
  end if;
  if current_order.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'Order version conflict.';
  end if;

  update public.orders
  set notes = nullif(trim(p_notes), ''), version = version + 1, updated_at = now()
  where workspace_id = p_workspace_id and id = p_order_id
  returning * into updated_order;

  insert into public.audit_events (
    workspace_id, actor_type, actor_id, action, resource_type, resource_id,
    previous_state, new_state, source
  ) values (
    p_workspace_id, 'human', p_actor_id, 'order.notes_updated', 'order', p_order_id::text,
    jsonb_build_object('notes', current_order.notes),
    jsonb_build_object('notes', updated_order.notes),
    'orders_api'
  );

  return jsonb_build_object('id', updated_order.id, 'notes', updated_order.notes, 'version', updated_order.version);
end;
$$;

revoke all on function public.update_workspace_order_notes(uuid, uuid, uuid, bigint, text)
  from public, anon, authenticated;
grant execute on function public.update_workspace_order_notes(uuid, uuid, uuid, bigint, text)
  to service_role;

create or replace function public.transition_warehouse_order(
  p_workspace_id uuid,
  p_order_id uuid,
  p_actor_id uuid,
  p_new_status text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_order public.orders%rowtype;
begin
  if p_new_status not in ('packed', 'shipped') then
    raise exception using errcode = '22023', message = 'Unsupported warehouse status.';
  end if;
  if length(coalesce(p_note, '')) > 500 then
    raise exception using errcode = '22023', message = 'Warehouse note exceeds the maximum length.';
  end if;

  select * into current_order from public.orders
  where workspace_id = p_workspace_id and id = p_order_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Order not found.';
  end if;
  if not (
    (current_order.warehouse_status = 'pending' and p_new_status in ('packed', 'shipped'))
    or (current_order.warehouse_status = 'packed' and p_new_status = 'shipped')
  ) then
    raise exception using errcode = '22023', message = 'Invalid warehouse status transition.';
  end if;

  update public.orders
  set warehouse_status = p_new_status, version = version + 1, updated_at = now()
  where workspace_id = p_workspace_id and id = p_order_id;

  insert into public.warehouse_audit_log (
    workspace_id, order_id, user_id, previous_status, new_status, note, created_at
  ) values (
    p_workspace_id, p_order_id, p_actor_id, current_order.warehouse_status,
    p_new_status, nullif(trim(coalesce(p_note, '')), ''), now()
  );
  insert into public.audit_events (
    workspace_id, actor_type, actor_id, action, resource_type, resource_id,
    previous_state, new_state, source
  ) values (
    p_workspace_id, 'human', p_actor_id, 'warehouse.status_changed', 'order', p_order_id::text,
    jsonb_build_object('warehouseStatus', current_order.warehouse_status),
    jsonb_build_object('warehouseStatus', p_new_status), 'warehouse_api'
  );

  return jsonb_build_object(
    'orderId', p_order_id,
    'previousStatus', current_order.warehouse_status,
    'newStatus', p_new_status
  );
end;
$$;

revoke all on function public.transition_warehouse_order(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.transition_warehouse_order(uuid, uuid, uuid, text, text)
  to service_role;

create or replace function public.scan_workspace_listing_alerts(
  p_workspace_id uuid,
  p_actor_id uuid,
  p_low_stock_threshold integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer := 0;
  scanned_count integer := 0;
  stale_count integer := 0;
begin
  if p_low_stock_threshold < 1 or p_low_stock_threshold > 100000 then
    raise exception using errcode = '22023', message = 'Low-stock threshold is outside the allowed range.';
  end if;

  select count(*) into scanned_count from public.listings listing
  where listing.workspace_id = p_workspace_id
    and listing.data_source = 'amazon_sp_api_report'
    and listing.source_updated_at >= now() - interval '72 hours';
  select count(*) into stale_count from public.listings listing
  where listing.workspace_id = p_workspace_id
    and listing.data_source = 'amazon_sp_api_report'
    and (listing.source_updated_at is null or listing.source_updated_at < now() - interval '72 hours');

  update public.listing_alerts
  set resolved = true, resolved_at = now(), updated_at = now()
  where workspace_id = p_workspace_id
    and resolved = false
    and data_source = 'amazon_sp_api_report'
    and alert_type in ('LOW_STOCK', 'OUT_OF_STOCK');

  insert into public.listing_alerts (
    workspace_id, user_id, sku, asin, alert_type, severity, reason,
    recommended_action, resolved, data_source, source_updated_at, created_at, updated_at
  )
  select
    p_workspace_id,
    p_actor_id,
    listing.sku,
    coalesce(listing.asin, 'N/A'),
    case when listing.available_qty = 0 then 'OUT_OF_STOCK' else 'LOW_STOCK' end,
    case when listing.available_qty = 0 then 'CRITICAL' else 'WARNING' end,
    case
      when listing.available_qty = 0 then format('Amazon listing report shows 0 available units for SKU %s.', listing.sku)
      else format('Amazon listing report shows %s available units for SKU %s.', listing.available_qty, listing.sku)
    end,
    case
      when listing.available_qty = 0 then 'Review inbound inventory and replenishment timing before taking action.'
      else format('Review sales velocity and reorder policy; the configured threshold is %s units.', p_low_stock_threshold)
    end,
    false,
    'amazon_sp_api_report',
    listing.source_updated_at,
    now(),
    now()
  from public.listings listing
  where listing.workspace_id = p_workspace_id
    and listing.data_source = 'amazon_sp_api_report'
    and listing.source_updated_at >= now() - interval '72 hours'
    and listing.available_qty <= p_low_stock_threshold;
  get diagnostics inserted_count = row_count;

  insert into public.audit_events (
    workspace_id, actor_type, actor_id, action, resource_type, resource_id,
    new_state, source
  ) values (
    p_workspace_id, 'human', p_actor_id, 'listing_alerts.scanned', 'workspace', p_workspace_id::text,
    jsonb_build_object(
      'threshold', p_low_stock_threshold,
      'scannedListings', scanned_count,
      'staleListingsExcluded', stale_count,
      'alertsCreated', inserted_count
    ),
    'alerts_api'
  );

  return jsonb_build_object(
    'alertsCreated', inserted_count,
    'scannedListings', scanned_count,
    'staleListingsExcluded', stale_count,
    'threshold', p_low_stock_threshold
  );
end;
$$;

revoke all on function public.scan_workspace_listing_alerts(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.scan_workspace_listing_alerts(uuid, uuid, integer)
  to service_role;

create or replace function public.resolve_workspace_listing_alert(
  p_workspace_id uuid,
  p_alert_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_alert public.listing_alerts%rowtype;
begin
  select * into current_alert from public.listing_alerts
  where workspace_id = p_workspace_id and id = p_alert_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Alert not found.';
  end if;

  update public.listing_alerts
  set resolved = true, resolved_at = now(), updated_at = now()
  where workspace_id = p_workspace_id and id = p_alert_id;
  insert into public.audit_events (
    workspace_id, actor_type, actor_id, action, resource_type, resource_id,
    previous_state, new_state, source
  ) values (
    p_workspace_id, 'human', p_actor_id, 'listing_alert.resolved', 'listing_alert', p_alert_id::text,
    jsonb_build_object('resolved', current_alert.resolved),
    jsonb_build_object('resolved', true), 'alerts_api'
  );
  return jsonb_build_object('id', p_alert_id, 'resolved', true);
end;
$$;

revoke all on function public.resolve_workspace_listing_alert(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.resolve_workspace_listing_alert(uuid, uuid, uuid)
  to service_role;

-- Standard tenant policies. Direct writes are limited to owners/admins; domain
-- roles use permission-checked server endpoints. Sensitive secret tables remain
-- service-role only and intentionally receive no authenticated policies.
do $migration$
declare
  current_table text;
  policy_record record;
  readable_tables text[] := array[
    'subscriptions', 'payments', 'products', 'variants', 'master_skus', 'listings',
    'listing_versions', 'warehouses', 'inventory', 'orders', 'order_items',
    'shipments', 'returns', 'keywords', 'keyword_rankings', 'competitors',
    'expenses', 'alerts', 'notifications', 'support_tickets', 'ai_generations',
    'seller_financial_metrics', 'product_analytics', 'ad_performance_logs',
    'inventory_planner', 'widget_layouts', 'alert_logs', 'goals', 'milestones',
    'cost_profiles', 'raw_materials', 'advertising_campaigns', 'advertising_performance_daily', 'refunds',
    'listing_alerts', 'automation_preferences',
    'ai_recommendation_history', 'ai_knowledge_center', 'workflow_state',
    'approval_policies', 'ai_schedules', 'marketplace_accounts', 'sync_checkpoints',
    'action_proposals', 'action_executions', 'jobs', 'events', 'audit_logs',
    'activities', 'automation_logs', 'automation_executions', 'warehouse_audit_log',
    'ai_usage_logs', 'ai_usage_records', 'system_logs', 'ai_telemetry_metrics',
    'worker_devices', 'ai_memories', 'file_assets', 'automation_controls',
    'ai_budget_policies'
  ];
  writable_tables text[] := array[
    'products', 'variants', 'master_skus', 'listings', 'warehouses', 'inventory',
    'orders', 'order_items', 'shipments', 'returns', 'keywords', 'keyword_rankings',
    'competitors', 'alerts', 'notifications', 'support_tickets',
    'widget_layouts', 'milestones', 'cost_profiles', 'raw_materials',
    'automation_preferences'
  ];
begin
  foreach current_table in array readable_tables loop
    if to_regclass(format('public.%I', current_table)) is not null then
      execute format('alter table public.%I enable row level security', current_table);
      execute format('alter table public.%I force row level security', current_table);
      for policy_record in
        select policyname from pg_policies policy_info
        where policy_info.schemaname = 'public' and policy_info.tablename = current_table
      loop
        execute format('drop policy if exists %I on public.%I', policy_record.policyname, current_table);
      end loop;
      execute format(
        'create policy tenant_select on public.%I for select to authenticated using (private.is_workspace_member(workspace_id))',
        current_table
      );
    end if;
  end loop;

  foreach current_table in array writable_tables loop
    if to_regclass(format('public.%I', current_table)) is not null then
      execute format(
        'create policy tenant_insert on public.%I for insert to authenticated with check (private.can_manage_workspace(workspace_id))',
        current_table
      );
      execute format(
        'create policy tenant_update on public.%I for update to authenticated using (private.can_manage_workspace(workspace_id)) with check (private.can_manage_workspace(workspace_id))',
        current_table
      );
      execute format(
        'create policy tenant_delete on public.%I for delete to authenticated using (private.can_manage_workspace(workspace_id))',
        current_table
      );
    end if;
  end loop;
end
$migration$;

-- Secret-bearing and internal coordination tables are service-only.
do $migration$
declare
  current_table text;
  policy_record record;
  secret_tables text[] := array[
    'api_keys', 'llm_settings', 'amazon_connections', 'amazon_user_tokens',
    'amazon_developer_credentials', 'integration_credentials', 'idempotency_records',
    'resource_locks', 'oauth_states', 'feature_flag_overrides', 'ai_response_cache',
    'ai_resilience_states', 'heartbeats', 'notification_settings',
    'ai_budget_reservations'
  ];
begin
  foreach current_table in array secret_tables loop
    if to_regclass(format('public.%I', current_table)) is not null then
      execute format('alter table public.%I enable row level security', current_table);
      execute format('alter table public.%I force row level security', current_table);
      for policy_record in
        select policyname from pg_policies policy_info
        where policy_info.schemaname = 'public' and policy_info.tablename = current_table
      loop
        execute format('drop policy if exists %I on public.%I', policy_record.policyname, current_table);
      end loop;
    end if;
  end loop;
end
$migration$;

-- Historical notification migrations stored webhook and bot credentials in
-- plaintext. Direct access is removed and those values are cleared; users must
-- rotate/re-enter integrations so the application can store them encrypted in
-- integration_credentials.
alter table public.notification_settings
  drop constraint if exists notification_settings_user_id_key;
create unique index if not exists uq_notification_settings_workspace_user
  on public.notification_settings(workspace_id, user_id);
update public.notification_settings
set discord_webhook_url = null,
    telegram_bot_token = null,
    telegram_chat_id = null
where discord_webhook_url is not null
   or telegram_bot_token is not null
   or telegram_chat_id is not null;

alter table if exists public.feature_flag_overrides
  drop constraint if exists feature_flag_overrides_pkey;
create unique index if not exists uq_feature_flag_override_workspace_user
  on public.feature_flag_overrides(workspace_id, flag_key, user_id)
  where workspace_id is not null;

-- Remove every historical anonymous policy, including tables added by earlier
-- development migrations that are not part of the explicit lists above.
do $migration$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and (
        policyname ilike '%anonymous%'
        or policyname ilike '%anon%'
        or coalesce(array_to_string(roles, ','), '') like '%anon%'
      )
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end
$migration$;

-- Workspace directory policies use non-recursive private helpers.
do $migration$
declare policy_record record;
begin
  for policy_record in select policyname from pg_policies
    where schemaname = 'public' and tablename = 'workspaces'
  loop
    execute format('drop policy if exists %I on public.workspaces', policy_record.policyname);
  end loop;
  for policy_record in select policyname from pg_policies
    where schemaname = 'public' and tablename = 'workspace_members'
  loop
    execute format('drop policy if exists %I on public.workspace_members', policy_record.policyname);
  end loop;
end
$migration$;

alter table public.workspaces enable row level security;
alter table public.workspaces force row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_members force row level security;

create policy workspace_select on public.workspaces for select to authenticated
  using (private.is_workspace_member(id));
create policy workspace_update on public.workspaces for update to authenticated
  using (private.can_manage_workspace(id))
  with check (private.can_manage_workspace(id));
create policy membership_select on public.workspace_members for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy membership_insert on public.workspace_members for insert to authenticated
  with check (private.can_manage_workspace(workspace_id));
create policy membership_update on public.workspace_members for update to authenticated
  using (private.can_manage_workspace(workspace_id))
  with check (private.can_manage_workspace(workspace_id));
create policy membership_delete on public.workspace_members for delete to authenticated
  using (private.can_manage_workspace(workspace_id) and user_id <> (select auth.uid()));

create index if not exists idx_marketplace_accounts_workspace_status
  on public.marketplace_accounts(workspace_id, status);

-- Structured seller memory is versioned and never overwritten in place. The
-- previous active value is retained for audit/rollback and hidden from normal
-- reads. Only the service role can invoke these mutation functions.
create index if not exists idx_ai_memories_workspace_active_updated
  on public.ai_memories(workspace_id, updated_at desc)
  where is_active = true;

create or replace function public.upsert_workspace_ai_memory(
  p_workspace_id uuid,
  p_actor_id uuid,
  p_scope_type text,
  p_scope_id text,
  p_memory_key text,
  p_value jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_memory public.ai_memories%rowtype;
  created_memory public.ai_memories%rowtype;
  next_version integer;
begin
  if p_scope_type not in ('workspace', 'brand', 'marketplace', 'product', 'workflow')
     or p_memory_key !~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$'
     or p_value is null then
    raise exception using errcode = '22023', message = 'Invalid structured memory.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_workspace_id::text || ':' || p_scope_type || ':' || coalesce(p_scope_id, '') || ':' || p_memory_key,
      0
    )
  );
  select * into previous_memory
  from public.ai_memories
  where workspace_id = p_workspace_id
    and scope_type = p_scope_type
    and scope_id is not distinct from nullif(trim(p_scope_id), '')
    and memory_key = p_memory_key
    and is_active = true
  order by version desc
  limit 1
  for update;

  select coalesce(max(version), 0) + 1 into next_version
  from public.ai_memories
  where workspace_id = p_workspace_id
    and scope_type = p_scope_type
    and scope_id is not distinct from nullif(trim(p_scope_id), '')
    and memory_key = p_memory_key;

  update public.ai_memories
  set is_active = false, updated_at = now()
  where workspace_id = p_workspace_id
    and scope_type = p_scope_type
    and scope_id is not distinct from nullif(trim(p_scope_id), '')
    and memory_key = p_memory_key
    and is_active = true;

  insert into public.ai_memories (
    workspace_id, scope_type, scope_id, memory_key, value, source,
    version, is_active, created_by
  ) values (
    p_workspace_id, p_scope_type, nullif(trim(p_scope_id), ''), p_memory_key,
    p_value, 'seller', next_version, true, p_actor_id
  ) returning * into created_memory;

  insert into public.audit_events (
    workspace_id, actor_type, actor_id, action, resource_type, resource_id,
    previous_state, new_state, source
  ) values (
    p_workspace_id, 'human', p_actor_id,
    case when previous_memory.id is null then 'ai_memory.created' else 'ai_memory.version_created' end,
    'ai_memory', created_memory.id::text,
    case when previous_memory.id is null then null else jsonb_build_object(
      'id', previous_memory.id, 'version', previous_memory.version, 'value', previous_memory.value
    ) end,
    jsonb_build_object(
      'scope_type', created_memory.scope_type, 'scope_id', created_memory.scope_id,
      'memory_key', created_memory.memory_key, 'version', created_memory.version,
      'value', created_memory.value, 'source', created_memory.source
    ),
    'ai_memories_api'
  );
  return to_jsonb(created_memory);
end;
$$;

create or replace function public.deactivate_workspace_ai_memory(
  p_workspace_id uuid,
  p_actor_id uuid,
  p_memory_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_memory public.ai_memories%rowtype;
begin
  select * into current_memory from public.ai_memories
  where workspace_id = p_workspace_id and id = p_memory_id and is_active = true
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Memory not found.';
  end if;
  update public.ai_memories
  set is_active = false, updated_at = now()
  where workspace_id = p_workspace_id and id = p_memory_id;
  insert into public.audit_events (
    workspace_id, actor_type, actor_id, action, resource_type, resource_id,
    previous_state, new_state, source
  ) values (
    p_workspace_id, 'human', p_actor_id, 'ai_memory.deactivated', 'ai_memory', p_memory_id::text,
    jsonb_build_object(
      'scope_type', current_memory.scope_type, 'scope_id', current_memory.scope_id,
      'memory_key', current_memory.memory_key, 'version', current_memory.version,
      'value', current_memory.value, 'source', current_memory.source
    ),
    jsonb_build_object('is_active', false), 'ai_memories_api'
  );
  return jsonb_build_object('id', p_memory_id, 'active', false);
end;
$$;

revoke all on function public.upsert_workspace_ai_memory(uuid, uuid, text, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.deactivate_workspace_ai_memory(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.upsert_workspace_ai_memory(uuid, uuid, text, text, text, jsonb)
  to service_role;
grant execute on function public.deactivate_workspace_ai_memory(uuid, uuid, uuid)
  to service_role;

-- Recurring jobs are claimed with a short lease so concurrent cron invocations
-- cannot enqueue the same occurrence. Invalid schedules are paused explicitly;
-- there is no silent fallback schedule.
alter table public.ai_schedules
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists version bigint not null default 1,
  add column if not exists last_error text,
  add column if not exists lease_token uuid,
  add column if not exists lease_expires_at timestamptz;

create index if not exists idx_ai_schedules_due_lease
  on public.ai_schedules(next_run, lease_expires_at)
  where status = 'active';

create or replace function public.create_workspace_ai_schedule(
  p_workspace_id uuid,
  p_actor_id uuid,
  p_title text,
  p_task_type text,
  p_cron_schedule text,
  p_next_run timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_schedule public.ai_schedules%rowtype;
begin
  if p_workspace_id is null or p_actor_id is null or length(trim(p_title)) not between 1 and 80
     or p_task_type is null or p_cron_schedule is null or p_next_run is null then
    raise exception using errcode = '22023', message = 'Invalid schedule configuration.';
  end if;
  insert into public.ai_schedules (
    workspace_id, user_id, title, task_type, cron_schedule, status, next_run
  ) values (
    p_workspace_id, p_actor_id, trim(p_title), p_task_type, p_cron_schedule, 'active', p_next_run
  ) returning * into created_schedule;

  insert into public.audit_events (
    workspace_id, actor_type, actor_id, action, resource_type, resource_id,
    new_state, source
  ) values (
    p_workspace_id, 'human', p_actor_id, 'ai_schedule.created', 'ai_schedule', created_schedule.id::text,
    jsonb_build_object(
      'title', created_schedule.title,
      'task_type', created_schedule.task_type,
      'cron_schedule', created_schedule.cron_schedule,
      'status', created_schedule.status,
      'next_run', created_schedule.next_run
    ),
    'schedules_api'
  );
  return to_jsonb(created_schedule) - 'lease_token';
end;
$$;

create or replace function public.set_workspace_ai_schedule_status(
  p_workspace_id uuid,
  p_schedule_id uuid,
  p_actor_id uuid,
  p_status text,
  p_resume_after timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_schedule public.ai_schedules%rowtype;
  changed_schedule public.ai_schedules%rowtype;
begin
  if p_status not in ('active', 'paused') then
    raise exception using errcode = '22023', message = 'Invalid schedule status.';
  end if;
  select * into current_schedule from public.ai_schedules
  where workspace_id = p_workspace_id and id = p_schedule_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Schedule not found.';
  end if;

  update public.ai_schedules
  set status = p_status,
      next_run = case when p_status = 'active' then coalesce(p_resume_after, next_run) else next_run end,
      last_error = case when p_status = 'active' then null else last_error end,
      lease_token = null,
      lease_expires_at = null,
      updated_at = now(),
      version = version + 1
  where workspace_id = p_workspace_id and id = p_schedule_id
  returning * into changed_schedule;

  insert into public.audit_events (
    workspace_id, actor_type, actor_id, action, resource_type, resource_id,
    previous_state, new_state, source
  ) values (
    p_workspace_id, 'human', p_actor_id, 'ai_schedule.status_changed', 'ai_schedule', p_schedule_id::text,
    jsonb_build_object('status', current_schedule.status, 'next_run', current_schedule.next_run),
    jsonb_build_object('status', changed_schedule.status, 'next_run', changed_schedule.next_run),
    'schedules_api'
  );
  return to_jsonb(changed_schedule) - 'lease_token';
end;
$$;

create or replace function public.delete_workspace_ai_schedule(
  p_workspace_id uuid,
  p_schedule_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_schedule public.ai_schedules%rowtype;
begin
  select * into current_schedule from public.ai_schedules
  where workspace_id = p_workspace_id and id = p_schedule_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Schedule not found.';
  end if;

  insert into public.audit_events (
    workspace_id, actor_type, actor_id, action, resource_type, resource_id,
    previous_state, source
  ) values (
    p_workspace_id, 'human', p_actor_id, 'ai_schedule.deleted', 'ai_schedule', p_schedule_id::text,
    jsonb_build_object(
      'title', current_schedule.title,
      'task_type', current_schedule.task_type,
      'cron_schedule', current_schedule.cron_schedule,
      'status', current_schedule.status
    ),
    'schedules_api'
  );
  delete from public.ai_schedules where workspace_id = p_workspace_id and id = p_schedule_id;
  return jsonb_build_object('id', p_schedule_id, 'deleted', true);
end;
$$;

create or replace function public.claim_due_ai_schedules(p_limit integer default 50)
returns table (
  schedule_id uuid,
  schedule_user_id uuid,
  schedule_workspace_id uuid,
  schedule_task_type text,
  schedule_cron text,
  schedule_title text,
  scheduled_for timestamptz,
  claim_token uuid
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with due as (
    select schedule.id
    from public.ai_schedules schedule
    where schedule.status = 'active'
      and schedule.next_run <= now()
      and (schedule.lease_expires_at is null or schedule.lease_expires_at < now())
    order by schedule.next_run asc
    for update skip locked
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  )
  update public.ai_schedules schedule
  set lease_token = gen_random_uuid(),
      lease_expires_at = now() + interval '5 minutes',
      updated_at = now()
  from due
  where schedule.id = due.id
  returning schedule.id, schedule.user_id, schedule.workspace_id,
    schedule.task_type, schedule.cron_schedule, schedule.title,
    schedule.next_run, schedule.lease_token;
end;
$$;

create or replace function public.complete_claimed_ai_schedule(
  p_schedule_id uuid,
  p_claim_token uuid,
  p_next_run timestamptz,
  p_job_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed_schedule public.ai_schedules%rowtype;
begin
  select * into claimed_schedule from public.ai_schedules
  where id = p_schedule_id and lease_token = p_claim_token
  for update;
  if not found then return false; end if;

  update public.ai_schedules
  set last_run = now(), next_run = p_next_run, last_error = null,
      lease_token = null, lease_expires_at = null,
      updated_at = now(), version = version + 1
  where id = p_schedule_id;
  insert into public.audit_events (
    workspace_id, actor_type, action, resource_type, resource_id, new_state, source, correlation_id
  ) values (
    claimed_schedule.workspace_id, 'system', 'ai_schedule.job_enqueued', 'ai_schedule', p_schedule_id::text,
    jsonb_build_object('job_id', p_job_id, 'scheduled_for', claimed_schedule.next_run, 'next_run', p_next_run),
    'task_scheduler', p_job_id::text
  );
  return true;
end;
$$;

create or replace function public.pause_claimed_ai_schedule(
  p_schedule_id uuid,
  p_claim_token uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed_schedule public.ai_schedules%rowtype;
begin
  select * into claimed_schedule from public.ai_schedules
  where id = p_schedule_id and lease_token = p_claim_token
  for update;
  if not found then return false; end if;

  update public.ai_schedules
  set status = 'paused', last_error = left(coalesce(p_reason, 'Schedule validation failed.'), 1000),
      lease_token = null, lease_expires_at = null,
      updated_at = now(), version = version + 1
  where id = p_schedule_id;
  insert into public.audit_events (
    workspace_id, actor_type, action, resource_type, resource_id,
    previous_state, new_state, source
  ) values (
    claimed_schedule.workspace_id, 'system', 'ai_schedule.paused_invalid', 'ai_schedule', p_schedule_id::text,
    jsonb_build_object('status', claimed_schedule.status),
    jsonb_build_object('status', 'paused', 'reason', left(coalesce(p_reason, 'Schedule validation failed.'), 1000)),
    'task_scheduler'
  );
  return true;
end;
$$;

revoke all on function public.create_workspace_ai_schedule(uuid, uuid, text, text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.set_workspace_ai_schedule_status(uuid, uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.delete_workspace_ai_schedule(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.claim_due_ai_schedules(integer)
  from public, anon, authenticated;
revoke all on function public.complete_claimed_ai_schedule(uuid, uuid, timestamptz, uuid)
  from public, anon, authenticated;
revoke all on function public.pause_claimed_ai_schedule(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.create_workspace_ai_schedule(uuid, uuid, text, text, text, timestamptz)
  to service_role;
grant execute on function public.set_workspace_ai_schedule_status(uuid, uuid, uuid, text, timestamptz)
  to service_role;
grant execute on function public.delete_workspace_ai_schedule(uuid, uuid, uuid)
  to service_role;
grant execute on function public.claim_due_ai_schedules(integer)
  to service_role;
grant execute on function public.complete_claimed_ai_schedule(uuid, uuid, timestamptz, uuid)
  to service_role;
grant execute on function public.pause_claimed_ai_schedule(uuid, uuid, text)
  to service_role;

create index if not exists idx_oauth_states_expiry
  on public.oauth_states(expires_at) where consumed_at is null;
create index if not exists idx_sync_checkpoints_due
  on public.sync_checkpoints(next_run_at) where freshness_state <> 'syncing';
create index if not exists idx_action_proposals_workspace_status
  on public.action_proposals(workspace_id, status, created_at desc);
create index if not exists idx_audit_events_workspace_created
  on public.audit_events(workspace_id, created_at desc);
create index if not exists idx_worker_devices_workspace_status
  on public.worker_devices(workspace_id, status);
create index if not exists idx_ai_usage_workspace_created
  on public.ai_usage_records(workspace_id, created_at desc);
create index if not exists idx_ai_budget_reservations_active
  on public.ai_budget_reservations(workspace_id, created_at, expires_at)
  where status = 'reserved';
create index if not exists idx_file_assets_workspace_created
  on public.file_assets(workspace_id, created_at desc);
create index if not exists idx_feedback_submissions_workspace_created
  on public.feedback_submissions(workspace_id, created_at desc);
create index if not exists idx_order_items_workspace_order
  on public.order_items(workspace_id, order_id);
create index if not exists idx_order_items_workspace_sku
  on public.order_items(workspace_id, seller_sku);
create index if not exists idx_order_items_workspace_asin
  on public.order_items(workspace_id, asin);

alter table public.feedback_submissions enable row level security;
alter table public.feedback_submissions force row level security;

alter table public.audit_events enable row level security;
alter table public.audit_events force row level security;
create policy tenant_select on public.audit_events for select to authenticated
  using (private.is_workspace_member(workspace_id));

notify pgrst, 'reload schema';
commit;
