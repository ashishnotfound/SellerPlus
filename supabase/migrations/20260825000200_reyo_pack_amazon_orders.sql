-- Reyo Pack Amazon Orders API v2026-01-01 compatibility

begin;

alter table public.orders
  add column if not exists amazon_order_status text,
  add column if not exists fulfilled_by text,
  add column if not exists amazon_programs text[] not null default '{}',
  add column if not exists cancellation_time_source text;

alter table public.orders
  drop constraint if exists orders_amazon_order_status_check;
alter table public.orders
  add constraint orders_amazon_order_status_check check (
    amazon_order_status is null or amazon_order_status in (
      'PENDING_AVAILABILITY', 'PENDING', 'UNSHIPPED',
      'PARTIALLY_SHIPPED', 'SHIPPED', 'CANCELLED', 'UNFULFILLABLE'
    )
  );
alter table public.orders
  drop constraint if exists orders_fulfilled_by_check;
alter table public.orders
  add constraint orders_fulfilled_by_check
  check (fulfilled_by is null or fulfilled_by in ('MERCHANT', 'AMAZON'));
alter table public.orders
  drop constraint if exists orders_cancellation_time_source_check;
alter table public.orders
  add constraint orders_cancellation_time_source_check check (
    cancellation_time_source is null
    or cancellation_time_source in ('AMAZON_LAST_UPDATED_TIME', 'SELLER_ENTERED')
  );

-- Legacy internal consumers still read orders.status. Include every internal
-- status emitted by the mapper while amazon_order_status retains Amazon's exact
-- source value.
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check check (status in (
  'pending', 'processing', 'packed', 'shipped', 'delivered', 'returned',
  'cancelled', 'unfulfillable', 'Pending', 'Unshipped', 'PartiallyShipped',
  'Shipped', 'Canceled', 'Unfulfillable', 'InvoiceUnconfirmed',
  'PendingAvailability'
));

-- A missing proceeds dataset is unknown, not zero INR.
alter table public.orders alter column total_amount drop not null;
alter table public.orders alter column currency drop not null;

drop index if exists public.uq_orders_workspace_account_channel_external;
alter table public.orders
  drop constraint if exists orders_workspace_account_channel_external_key;
alter table public.orders
  add constraint orders_workspace_account_channel_external_key
  unique (workspace_id, marketplace_account_id, channel, channel_order_id);

alter table public.order_items
  drop constraint if exists order_items_quantity_packed_check;
alter table public.order_items
  add constraint order_items_quantity_packed_check check (quantity_packed >= 0);

alter table public.shipments
  add column if not exists shipping_service text,
  add column if not exists source_api_version text;

drop index if exists public.uq_shipments_workspace_account_amazon_id;
alter table public.shipments
  drop constraint if exists shipments_workspace_account_amazon_id_key;
alter table public.shipments
  add constraint shipments_workspace_account_amazon_id_key
  unique (workspace_id, marketplace_account_id, amazon_shipment_id);

drop index if exists public.uq_reyo_pack_skus_account_sku;
alter table public.reyo_pack_skus
  drop constraint if exists reyo_pack_skus_workspace_account_sku_key;
alter table public.reyo_pack_skus
  add constraint reyo_pack_skus_workspace_account_sku_key
  unique (workspace_id, marketplace_account_id, sku_normalized);

alter table public.reyo_pack_sync_runs
  add column if not exists api_version text not null default 'orders-2026-01-01';

create unique index if not exists uq_reyo_pack_sync_account_active
  on public.reyo_pack_sync_runs(workspace_id, marketplace_account_id)
  where status in ('QUEUED', 'RUNNING');

create or replace function public.upsert_reyo_pack_amazon_package(
  p_workspace_id uuid,
  p_marketplace_account_id uuid,
  p_order_id uuid,
  p_package_reference_id text,
  p_tracking_number text,
  p_carrier text,
  p_package_status text,
  p_shipping_service text,
  p_package_created_at timestamptz,
  p_source_updated_at timestamptz,
  p_package_items jsonb,
  p_correlation_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order public.orders%rowtype;
  target_shipment public.shipments%rowtype;
  desired_allocations jsonb;
  current_allocations jsonb;
  correction_key text;
begin
  if char_length(coalesce(p_package_reference_id, '')) not between 1 and 500
     or p_source_updated_at is null
     or p_package_items is null
     or jsonb_typeof(p_package_items) <> 'array'
     or jsonb_array_length(p_package_items) > 1000 then
    raise exception using errcode = '22023', message = 'Invalid Amazon package payload.';
  end if;

  select * into target_order
  from public.orders
  where workspace_id = p_workspace_id
    and marketplace_account_id = p_marketplace_account_id
    and id = p_order_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Amazon package order not found.';
  end if;

  insert into public.shipments (
    workspace_id, marketplace_account_id, order_id, amazon_shipment_id,
    tracking_number, awb_code, carrier, status, shipping_service,
    source_api_version, source_updated_at, created_at, updated_at
  ) values (
    p_workspace_id, p_marketplace_account_id, p_order_id,
    trim(p_package_reference_id), nullif(trim(coalesce(p_tracking_number, '')), ''),
    nullif(trim(coalesce(p_tracking_number, '')), ''),
    nullif(trim(coalesce(p_carrier, '')), ''),
    nullif(trim(coalesce(p_package_status, '')), ''),
    nullif(trim(coalesce(p_shipping_service, '')), ''),
    'orders-2026-01-01', p_source_updated_at,
    coalesce(p_package_created_at, now()), now()
  )
  on conflict (workspace_id, marketplace_account_id, amazon_shipment_id) do update
  set tracking_number = coalesce(excluded.tracking_number, public.shipments.tracking_number),
      awb_code = coalesce(excluded.awb_code, public.shipments.awb_code),
      carrier = coalesce(excluded.carrier, public.shipments.carrier),
      status = coalesce(excluded.status, public.shipments.status),
      shipping_service = coalesce(excluded.shipping_service, public.shipments.shipping_service),
      source_api_version = excluded.source_api_version,
      source_updated_at = excluded.source_updated_at,
      updated_at = now()
  returning * into target_shipment;

  -- Lock the package before comparing/replacing its allocation. This serializes
  -- synchronization against a device claim/confirmation transaction.
  select * into target_shipment
  from public.shipments
  where id = target_shipment.id and workspace_id = p_workspace_id
  for update;

  if exists (
    select 1
    from jsonb_to_recordset(p_package_items) as package_item("orderItemId" text, quantity integer)
    left join public.order_items item
      on item.workspace_id = p_workspace_id
     and item.order_id = p_order_id
     and item.amazon_order_item_id = package_item."orderItemId"
    where package_item."orderItemId" is null
      or package_item.quantity is null
      or package_item.quantity <= 0
      or item.id is null
  ) then
    raise exception using errcode = '23514', message = 'Amazon package references an unknown or invalid order item.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'orderItemId', normalized."orderItemId",
    'quantity', normalized.quantity
  ) order by normalized."orderItemId"), '[]'::jsonb)
  into desired_allocations
  from (
    select package_item."orderItemId", sum(package_item.quantity)::integer as quantity
    from jsonb_to_recordset(p_package_items) as package_item("orderItemId" text, quantity integer)
    group by package_item."orderItemId"
  ) normalized;

  select coalesce(jsonb_agg(jsonb_build_object(
    'orderItemId', item.amazon_order_item_id,
    'quantity', allocation.quantity
  ) order by item.amazon_order_item_id), '[]'::jsonb)
  into current_allocations
  from public.reyo_pack_shipment_items allocation
  join public.order_items item
    on item.workspace_id = allocation.workspace_id
   and item.id = allocation.order_item_id
  where allocation.workspace_id = p_workspace_id
    and allocation.shipment_id = target_shipment.id;

  if target_shipment.packing_status in ('PACKED', 'CANCELLED') then
    if current_allocations <> desired_allocations then
      correction_key := 'sync:allocation-conflict:' || target_shipment.id::text
        || ':' || extract(epoch from p_source_updated_at)::bigint::text;
      insert into public.reyo_pack_packing_events (
        workspace_id, order_id, shipment_id, event_type, awb,
        previous_status, new_status, idempotency_key, reason,
        correlation_id, metadata
      ) values (
        p_workspace_id, p_order_id, target_shipment.id, 'ERROR',
        target_shipment.awb_code, target_shipment.packing_status,
        target_shipment.packing_status, correction_key,
        'Amazon changed package allocation after the local package became terminal.',
        p_correlation_id,
        jsonb_build_object(
          'currentAllocations', current_allocations,
          'amazonAllocations', desired_allocations
        )
      ) on conflict (workspace_id, idempotency_key)
        where idempotency_key is not null do nothing;
      return jsonb_build_object(
        'outcome', 'TERMINAL_ALLOCATION_CONFLICT',
        'shipmentId', target_shipment.id,
        'packingStatus', target_shipment.packing_status
      );
    end if;
    return jsonb_build_object(
      'outcome', 'TERMINAL_UNCHANGED',
      'shipmentId', target_shipment.id,
      'packingStatus', target_shipment.packing_status
    );
  end if;

  if target_shipment.packing_status = 'PACKING'
     and current_allocations <> desired_allocations then
    correction_key := 'sync:claimed-allocation-conflict:' || target_shipment.id::text
      || ':' || extract(epoch from p_source_updated_at)::bigint::text;
    insert into public.reyo_pack_packing_events (
      workspace_id, order_id, shipment_id, session_id, event_type, awb,
      previous_status, new_status, idempotency_key, reason,
      correlation_id, metadata
    ) values (
      p_workspace_id, p_order_id, target_shipment.id,
      target_shipment.packing_session_id, 'ERROR', target_shipment.awb_code,
      'PACKING', 'PACKING', correction_key,
      'Amazon changed package allocation while a worker held the package claim.',
      p_correlation_id,
      jsonb_build_object(
        'currentAllocations', current_allocations,
        'amazonAllocations', desired_allocations
      )
    ) on conflict (workspace_id, idempotency_key)
      where idempotency_key is not null do nothing;
    return jsonb_build_object(
      'outcome', 'CLAIMED_ALLOCATION_CONFLICT',
      'shipmentId', target_shipment.id,
      'packingStatus', 'PACKING'
    );
  end if;

  if current_allocations <> desired_allocations then
    delete from public.reyo_pack_shipment_items
    where workspace_id = p_workspace_id and shipment_id = target_shipment.id;

    insert into public.reyo_pack_shipment_items (
      workspace_id, order_id, shipment_id, order_item_id, quantity
    )
    select p_workspace_id, p_order_id, target_shipment.id, item.id,
           normalized.quantity
    from (
      select package_item."orderItemId", sum(package_item.quantity)::integer as quantity
      from jsonb_to_recordset(p_package_items) as package_item("orderItemId" text, quantity integer)
      group by package_item."orderItemId"
    ) normalized
    join public.order_items item
      on item.workspace_id = p_workspace_id
     and item.order_id = p_order_id
     and item.amazon_order_item_id = normalized."orderItemId";
  end if;

  if target_shipment.packing_status = 'ERROR' then
    correction_key := 'sync:allocation-corrected:' || target_shipment.id::text
      || ':' || extract(epoch from p_source_updated_at)::bigint::text;
    update public.shipments
    set packing_status = 'UNPACKED', updated_at = now()
    where id = target_shipment.id;
    insert into public.reyo_pack_packing_events (
      workspace_id, order_id, shipment_id, event_type, awb,
      previous_status, new_status, idempotency_key, reason,
      correlation_id, metadata
    ) values (
      p_workspace_id, p_order_id, target_shipment.id, 'PACK_CORRECTED',
      target_shipment.awb_code, 'ERROR', 'UNPACKED', correction_key,
      'A complete Amazon package allocation resolved the synchronization error.',
      p_correlation_id,
      jsonb_build_object('amazonAllocations', desired_allocations)
    ) on conflict (workspace_id, idempotency_key)
      where idempotency_key is not null do nothing;
  end if;

  return jsonb_build_object(
    'outcome', case when target_shipment.packing_status = 'ERROR'
      then 'ERROR_RESOLVED' else 'SYNCHRONIZED' end,
    'shipmentId', target_shipment.id,
    'allocationCount', jsonb_array_length(desired_allocations),
    'awbAvailable', target_shipment.awb_code is not null
  );
end;
$$;

revoke all on function public.upsert_reyo_pack_amazon_package(
  uuid, uuid, uuid, text, text, text, text, text,
  timestamptz, timestamptz, jsonb, text
) from public, anon, authenticated;
grant execute on function public.upsert_reyo_pack_amazon_package(
  uuid, uuid, uuid, text, text, text, text, text,
  timestamptz, timestamptz, jsonb, text
) to service_role;

-- Claim due marketplace accounts and create the sync-run/job pair in one
-- transaction. FOR UPDATE SKIP LOCKED serializes overlapping scheduler calls;
-- the active-run unique index remains the final database invariant.
create or replace function public.enqueue_due_reyo_pack_syncs(
  p_limit integer default 25
)
returns table (
  sync_run_id uuid,
  queued_job_id uuid,
  workspace_id uuid,
  marketplace_account_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate record;
  created_sync_run_id uuid;
  created_job_id uuid;
  actor_id uuid;
  updated_after_value timestamptz;
  updated_before_value timestamptz;
  correlation_value text;
begin
  if p_limit < 1 or p_limit > 100 then
    raise exception using errcode = '22023', message = 'p_limit must be between 1 and 100.';
  end if;

  for candidate in
    select
      account.id as account_id,
      account.workspace_id,
      account.created_by,
      workspace.owner_id,
      coalesce(setting.sync_interval_minutes, 15) as sync_interval_minutes,
      checkpoint.last_succeeded_at
    from public.marketplace_accounts account
    join public.workspaces workspace
      on workspace.id = account.workspace_id
     and workspace.status = 'active'
    left join public.reyo_pack_settings setting
      on setting.workspace_id = account.workspace_id
    left join public.sync_checkpoints checkpoint
      on checkpoint.workspace_id = account.workspace_id
     and checkpoint.marketplace_account_id = account.id
     and checkpoint.resource_type = 'reyo_pack_amazon_orders'
    left join public.automation_controls controls
      on controls.workspace_id = account.workspace_id
    where account.platform = 'amazon'
      and account.status = 'active'
      and 'selling_partner' = any(account.capabilities)
      and coalesce(controls.pause_all_automations, false) = false
      and coalesce(
        checkpoint.next_run_at,
        checkpoint.last_attempted_at
          + make_interval(mins => coalesce(setting.sync_interval_minutes, 15)),
        '-infinity'::timestamptz
      ) <= now()
      and not exists (
        select 1
        from public.reyo_pack_sync_runs active_run
        where active_run.workspace_id = account.workspace_id
          and active_run.marketplace_account_id = account.id
          and active_run.status in ('QUEUED', 'RUNNING')
      )
    order by coalesce(checkpoint.next_run_at, '-infinity'::timestamptz), account.created_at
    limit p_limit
    for update of account skip locked
  loop
    begin
      actor_id := coalesce(candidate.created_by, candidate.owner_id);
      if actor_id is null then
        continue;
      end if;

      updated_after_value := greatest(
        coalesce(candidate.last_succeeded_at - interval '5 minutes', now() - interval '90 days'),
        now() - interval '730 days'
      );
      updated_before_value := now() - interval '2 minutes';
      correlation_value := gen_random_uuid()::text;

      insert into public.reyo_pack_sync_runs (
        workspace_id, marketplace_account_id, sync_type, status,
        progress_message, correlation_id, requested_by
      ) values (
        candidate.workspace_id, candidate.account_id, 'INCREMENTAL', 'QUEUED',
        'Scheduled Amazon order synchronization is queued.',
        correlation_value, actor_id
      ) returning id into created_sync_run_id;

      insert into public.jobs (
        job_type, idempotency_key, payload, priority, status, run_at,
        attempts, max_attempts, user_id, workspace_id, resource_key,
        correlation_id
      ) values (
        'reyo_pack_amazon_sync',
        'reyo_pack_amazon_sync:' || created_sync_run_id::text,
        jsonb_build_object(
          'marketplaceAccountId', candidate.account_id,
          'syncRunId', created_sync_run_id,
          'syncType', 'INCREMENTAL',
          'updatedAfter', updated_after_value,
          'updatedBefore', updated_before_value,
          'phase', 'search',
          'pendingOrders', '[]'::jsonb,
          'pageCount', 0,
          'started', false,
          'counters', jsonb_build_object(
            'scanned', 0,
            'created', 0,
            'updated', 0,
            'cancelled', 0,
            'shipmentsUpdated', 0,
            'errors', 0
          )
        ),
        1, 'queued', now(), 0, 8, actor_id, candidate.workspace_id,
        'marketplace-account:' || candidate.account_id::text || ':reyo-pack-sync',
        correlation_value
      ) returning id into created_job_id;

      update public.reyo_pack_sync_runs
      set job_id = created_job_id, updated_at = now()
      where id = created_sync_run_id
        and workspace_id = candidate.workspace_id;

      insert into public.sync_checkpoints (
        workspace_id, marketplace_account_id, resource_type, cursor,
        last_attempted_at, next_run_at, freshness_state, updated_at
      ) values (
        candidate.workspace_id, candidate.account_id,
        'reyo_pack_amazon_orders', '{}'::jsonb,
        now(), null, 'syncing', now()
      )
      on conflict (workspace_id, marketplace_account_id, resource_type)
      do update set
        last_attempted_at = excluded.last_attempted_at,
        next_run_at = null,
        freshness_state = 'syncing',
        last_error_code = null,
        last_error_message = null,
        updated_at = excluded.updated_at;

      insert into public.audit_logs (workspace_id, user_id, action, details)
      values (
        candidate.workspace_id,
        actor_id,
        'reyo_pack.amazon_sync_scheduled',
        jsonb_build_object(
          'syncRunId', created_sync_run_id,
          'jobId', created_job_id,
          'marketplaceAccountId', candidate.account_id,
          'updatedAfter', updated_after_value,
          'updatedBefore', updated_before_value,
          'correlationId', correlation_value
        )
      );

      sync_run_id := created_sync_run_id;
      queued_job_id := created_job_id;
      workspace_id := candidate.workspace_id;
      marketplace_account_id := candidate.account_id;
      return next;
    exception
      when unique_violation then
        -- Another scheduler won the active-run or idempotency race. The block is
        -- a subtransaction, so it leaves no orphaned sync run.
        continue;
    end;
  end loop;
end;
$$;

revoke all on function public.enqueue_due_reyo_pack_syncs(integer)
  from public, anon, authenticated;
grant execute on function public.enqueue_due_reyo_pack_syncs(integer)
  to service_role;

create or replace function public.enqueue_reyo_pack_sync(
  p_workspace_id uuid,
  p_marketplace_account_id uuid,
  p_actor_id uuid,
  p_sync_type text,
  p_updated_after timestamptz,
  p_updated_before timestamptz,
  p_correlation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_record public.marketplace_accounts%rowtype;
  active_run public.reyo_pack_sync_runs%rowtype;
  created_sync_run_id uuid;
  created_job_id uuid;
  checkpoint_resource text;
begin
  if p_sync_type not in ('INCREMENTAL', 'FULL', 'ORDERS', 'SHIPPING')
     or p_updated_after is null
     or p_updated_before is null
     or p_updated_after >= p_updated_before
     or p_updated_after < now() - interval '730 days'
     or p_updated_before > now()
     or char_length(coalesce(p_correlation_id, '')) not between 1 and 200 then
    raise exception using errcode = '22023', message = 'Invalid Amazon synchronization request.';
  end if;
  if not exists (
    select 1
    from public.workspace_members membership
    where membership.workspace_id = p_workspace_id
      and membership.user_id = p_actor_id
  ) then
    raise exception using errcode = '42501', message = 'The synchronization actor is not a workspace member.';
  end if;

  select * into account_record
  from public.marketplace_accounts account
  where account.id = p_marketplace_account_id
    and account.workspace_id = p_workspace_id
    and account.platform = 'amazon'
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Amazon marketplace account not found.';
  end if;
  if account_record.status <> 'active'
     or not ('selling_partner' = any(account_record.capabilities)) then
    raise exception using errcode = '55000', message = 'Amazon SP-API is not active for this marketplace account.';
  end if;

  select * into active_run
  from public.reyo_pack_sync_runs run
  where run.workspace_id = p_workspace_id
    and run.marketplace_account_id = p_marketplace_account_id
    and run.status in ('QUEUED', 'RUNNING')
  order by run.created_at desc
  limit 1;
  if found then
    return jsonb_build_object(
      'syncRunId', active_run.id,
      'jobId', active_run.job_id,
      'syncType', active_run.sync_type,
      'status', active_run.status,
      'reused', true
    );
  end if;

  insert into public.reyo_pack_sync_runs (
    workspace_id, marketplace_account_id, sync_type, status,
    progress_message, correlation_id, requested_by
  ) values (
    p_workspace_id, p_marketplace_account_id, p_sync_type, 'QUEUED',
    case when p_sync_type = 'SHIPPING'
      then 'Shipping refresh is queued.'
      else 'Amazon order synchronization is queued.'
    end,
    p_correlation_id, p_actor_id
  ) returning id into created_sync_run_id;

  insert into public.jobs (
    job_type, idempotency_key, payload, priority, status, run_at,
    attempts, max_attempts, user_id, workspace_id, resource_key,
    correlation_id
  ) values (
    'reyo_pack_amazon_sync',
    'reyo_pack_amazon_sync:' || created_sync_run_id::text,
    jsonb_build_object(
      'marketplaceAccountId', p_marketplace_account_id,
      'syncRunId', created_sync_run_id,
      'syncType', p_sync_type,
      'updatedAfter', p_updated_after,
      'updatedBefore', p_updated_before,
      'phase', case when p_sync_type = 'SHIPPING' then 'shipping' else 'search' end,
      'pendingOrders', '[]'::jsonb,
      'pageCount', 0,
      'started', false,
      'counters', jsonb_build_object(
        'scanned', 0,
        'created', 0,
        'updated', 0,
        'cancelled', 0,
        'shipmentsUpdated', 0,
        'errors', 0
      )
    ),
    1, 'queued', now(), 0, 8, p_actor_id, p_workspace_id,
    'marketplace-account:' || p_marketplace_account_id::text || ':reyo-pack-sync',
    p_correlation_id
  ) returning id into created_job_id;

  update public.reyo_pack_sync_runs
  set job_id = created_job_id, updated_at = now()
  where id = created_sync_run_id and workspace_id = p_workspace_id;

  checkpoint_resource := case when p_sync_type = 'SHIPPING'
    then 'reyo_pack_amazon_shipping' else 'reyo_pack_amazon_orders' end;
  insert into public.sync_checkpoints (
    workspace_id, marketplace_account_id, resource_type, cursor,
    last_attempted_at, next_run_at, freshness_state, updated_at
  ) values (
    p_workspace_id, p_marketplace_account_id, checkpoint_resource,
    '{}'::jsonb, now(), null, 'syncing', now()
  )
  on conflict (workspace_id, marketplace_account_id, resource_type)
  do update set
    last_attempted_at = excluded.last_attempted_at,
    next_run_at = null,
    freshness_state = 'syncing',
    last_error_code = null,
    last_error_message = null,
    updated_at = excluded.updated_at;

  insert into public.audit_logs (workspace_id, user_id, action, details)
  values (
    p_workspace_id,
    p_actor_id,
    'reyo_pack.amazon_sync_requested',
    jsonb_build_object(
      'syncRunId', created_sync_run_id,
      'jobId', created_job_id,
      'marketplaceAccountId', p_marketplace_account_id,
      'syncType', p_sync_type,
      'updatedAfter', p_updated_after,
      'updatedBefore', p_updated_before,
      'correlationId', p_correlation_id
    )
  );

  return jsonb_build_object(
    'syncRunId', created_sync_run_id,
    'jobId', created_job_id,
    'syncType', p_sync_type,
    'status', 'QUEUED',
    'reused', false
  );
end;
$$;

revoke all on function public.enqueue_reyo_pack_sync(
  uuid, uuid, uuid, text, timestamptz, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.enqueue_reyo_pack_sync(
  uuid, uuid, uuid, text, timestamptz, timestamptz, text
) to service_role;

create or replace function public.complete_reyo_pack_sync(
  p_workspace_id uuid,
  p_sync_run_id uuid,
  p_updated_before timestamptz,
  p_counters jsonb,
  p_has_conflicts boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_run public.reyo_pack_sync_runs%rowtype;
  counter_values record;
  sync_status text;
  checkpoint_resource text;
  sync_interval integer;
  actor_id uuid;
  was_terminal boolean;
begin
  if p_updated_before is null
     or p_updated_before > now()
     or p_counters is null
     or jsonb_typeof(p_counters) <> 'object' then
    raise exception using errcode = '22023', message = 'Invalid Amazon synchronization completion.';
  end if;
  select * into counter_values
  from jsonb_to_record(p_counters) as counters(
    scanned integer,
    created integer,
    updated integer,
    cancelled integer,
    "shipmentsUpdated" integer,
    errors integer
  );
  if counter_values.scanned is null or counter_values.scanned < 0
     or counter_values.created is null or counter_values.created < 0
     or counter_values.updated is null or counter_values.updated < 0
     or counter_values.cancelled is null or counter_values.cancelled < 0
     or counter_values."shipmentsUpdated" is null or counter_values."shipmentsUpdated" < 0
     or counter_values.errors is null or counter_values.errors < 0 then
    raise exception using errcode = '22023', message = 'Invalid Amazon synchronization counters.';
  end if;

  select * into target_run
  from public.reyo_pack_sync_runs
  where id = p_sync_run_id and workspace_id = p_workspace_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Amazon synchronization run not found.';
  end if;
  was_terminal := target_run.status in ('SUCCEEDED', 'PARTIAL');
  if target_run.status in ('FAILED', 'CANCELLED') then
    raise exception using errcode = '55000', message = 'A failed or cancelled synchronization cannot be completed.';
  end if;

  sync_status := case when p_has_conflicts then 'PARTIAL' else 'SUCCEEDED' end;
  update public.reyo_pack_sync_runs
  set status = sync_status,
      orders_scanned = counter_values.scanned,
      orders_new = counter_values.created,
      orders_updated = counter_values.updated,
      orders_cancelled = counter_values.cancelled,
      shipments_updated = counter_values."shipmentsUpdated",
      error_count = counter_values.errors,
      progress_message = case when p_has_conflicts
        then 'Synchronization completed with package allocation conflicts.'
        else 'Amazon orders and package tracking are current.'
      end,
      last_error_code = null,
      last_error_message = null,
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
  where id = target_run.id and workspace_id = p_workspace_id;

  checkpoint_resource := case when target_run.sync_type = 'SHIPPING'
    then 'reyo_pack_amazon_shipping' else 'reyo_pack_amazon_orders' end;
  select coalesce(setting.sync_interval_minutes, 15)
  into sync_interval
  from (select 1) singleton
  left join public.reyo_pack_settings setting
    on setting.workspace_id = p_workspace_id;

  insert into public.sync_checkpoints (
    workspace_id, marketplace_account_id, resource_type, cursor,
    last_attempted_at, last_succeeded_at, next_run_at,
    failure_count, freshness_state, last_error_code, last_error_message,
    updated_at
  ) values (
    p_workspace_id, target_run.marketplace_account_id, checkpoint_resource,
    jsonb_build_object('lastUpdatedAfter', p_updated_before - interval '5 minutes'),
    now(), now(), now() + make_interval(mins => sync_interval),
    0, case when p_has_conflicts then 'stale' else 'fresh' end,
    case when p_has_conflicts then 'PACKAGE_ALLOCATION_CONFLICT' else null end,
    case when p_has_conflicts
      then 'One or more Amazon package allocations changed during or after packing.'
      else null
    end,
    now()
  )
  on conflict (workspace_id, marketplace_account_id, resource_type)
  do update set
    cursor = excluded.cursor,
    last_attempted_at = excluded.last_attempted_at,
    last_succeeded_at = excluded.last_succeeded_at,
    next_run_at = excluded.next_run_at,
    failure_count = 0,
    freshness_state = excluded.freshness_state,
    last_error_code = excluded.last_error_code,
    last_error_message = excluded.last_error_message,
    updated_at = excluded.updated_at;

  if not was_terminal then
    select coalesce(target_run.requested_by, workspace.owner_id)
    into actor_id
    from public.workspaces workspace
    where workspace.id = p_workspace_id;
    if actor_id is not null then
      insert into public.audit_logs (workspace_id, user_id, action, details)
      values (
        p_workspace_id,
        actor_id,
        'reyo_pack.amazon_sync_completed',
        jsonb_build_object(
          'syncRunId', target_run.id,
          'jobId', target_run.job_id,
          'marketplaceAccountId', target_run.marketplace_account_id,
          'status', sync_status,
          'counters', p_counters,
          'correlationId', target_run.correlation_id
        )
      );
    end if;
  end if;

  return jsonb_build_object('syncRunId', target_run.id, 'status', sync_status);
end;
$$;

revoke all on function public.complete_reyo_pack_sync(
  uuid, uuid, timestamptz, jsonb, boolean
) from public, anon, authenticated;
grant execute on function public.complete_reyo_pack_sync(
  uuid, uuid, timestamptz, jsonb, boolean
) to service_role;

create or replace function public.fail_reyo_pack_sync(
  p_workspace_id uuid,
  p_sync_run_id uuid,
  p_error_code text,
  p_error_message text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_run public.reyo_pack_sync_runs%rowtype;
  retry_count integer;
  actor_id uuid;
  checkpoint_resource text;
begin
  if char_length(coalesce(p_error_code, '')) not between 1 and 100
     or char_length(coalesce(p_error_message, '')) not between 1 and 1000 then
    raise exception using errcode = '22023', message = 'Invalid Amazon synchronization failure.';
  end if;

  select * into target_run
  from public.reyo_pack_sync_runs
  where id = p_sync_run_id and workspace_id = p_workspace_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Amazon synchronization run not found.';
  end if;

  if target_run.status in ('SUCCEEDED', 'PARTIAL', 'CANCELLED') then
    return;
  end if;

  update public.reyo_pack_sync_runs
  set status = 'FAILED',
      progress_message = 'Amazon synchronization exhausted its retry policy.',
      last_error_code = p_error_code,
      last_error_message = p_error_message,
      completed_at = now(),
      updated_at = now()
  where id = target_run.id and workspace_id = p_workspace_id;

  checkpoint_resource := case when target_run.sync_type = 'SHIPPING'
    then 'reyo_pack_amazon_shipping' else 'reyo_pack_amazon_orders' end;
  insert into public.sync_checkpoints (
    workspace_id, marketplace_account_id, resource_type, cursor,
    last_attempted_at, next_run_at, failure_count, freshness_state,
    last_error_code, last_error_message, updated_at
  ) values (
    p_workspace_id, target_run.marketplace_account_id,
    checkpoint_resource, '{}'::jsonb,
    now(), now() + interval '5 minutes', 1, 'error',
    p_error_code, p_error_message, now()
  )
  on conflict (workspace_id, marketplace_account_id, resource_type)
  do update set
    last_attempted_at = excluded.last_attempted_at,
    failure_count = public.sync_checkpoints.failure_count + 1,
    next_run_at = now() + make_interval(
      mins => 5 * (2 ^ least(public.sync_checkpoints.failure_count, 5))::integer
    ),
    freshness_state = 'error',
    last_error_code = excluded.last_error_code,
    last_error_message = excluded.last_error_message,
    updated_at = excluded.updated_at
  returning failure_count into retry_count;

  select coalesce(target_run.requested_by, workspace.owner_id)
  into actor_id
  from public.workspaces workspace
  where workspace.id = p_workspace_id;
  if actor_id is not null then
    insert into public.audit_logs (workspace_id, user_id, action, details)
    values (
      p_workspace_id,
      actor_id,
      'reyo_pack.amazon_sync_failed',
      jsonb_build_object(
        'syncRunId', target_run.id,
        'jobId', target_run.job_id,
        'marketplaceAccountId', target_run.marketplace_account_id,
        'errorCode', p_error_code,
        'errorMessage', p_error_message,
        'failureCount', retry_count,
        'correlationId', target_run.correlation_id
      )
    );
  end if;
end;
$$;

revoke all on function public.fail_reyo_pack_sync(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.fail_reyo_pack_sync(uuid, uuid, text, text)
  to service_role;

create index if not exists idx_orders_workspace_amazon_status_ship_by
  on public.orders(workspace_id, amazon_order_status, ship_by_date, purchase_date)
  where fulfilled_by = 'MERCHANT';
create index if not exists idx_shipments_workspace_source_updated
  on public.shipments(workspace_id, source_updated_at desc);

notify pgrst, 'reload schema';
commit;
