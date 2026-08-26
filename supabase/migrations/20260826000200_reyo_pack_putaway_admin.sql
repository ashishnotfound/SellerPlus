-- Reyo Pack putaway lookup/confirmation and audited administration

begin;

alter table public.reyo_pack_settings
  add column if not exists sound_volume numeric(3,2) not null default 1.00;
alter table public.reyo_pack_settings
  drop constraint if exists reyo_pack_settings_sound_volume_check;
alter table public.reyo_pack_settings
  add constraint reyo_pack_settings_sound_volume_check
  check (sound_volume between 0 and 1);

create or replace function public.lookup_reyo_putaway_product(
  p_workspace_id uuid,
  p_actor_id uuid,
  p_session_id uuid,
  p_barcode text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_barcode text;
  candidate_count integer;
  target_sku public.reyo_pack_skus%rowtype;
  target_assignment public.reyo_pack_sku_locations%rowtype;
  target_location public.reyo_pack_locations%rowtype;
begin
  if char_length(coalesce(p_barcode, '')) not between 1 and 500 then
    raise exception using errcode = '22023', message = 'Invalid product barcode.';
  end if;
  if not exists (
    select 1
    from public.reyo_pack_sessions session
    where session.workspace_id = p_workspace_id
      and session.id = p_session_id
      and session.started_by = p_actor_id
      and session.status = 'ACTIVE'
      and session.mode = 'PUTAWAY'
  ) then
    raise exception using errcode = '22023', message = 'An active putaway session is required.';
  end if;

  normalized_barcode := private.normalize_reyo_pack_barcode(p_barcode);
  select count(distinct sku.id) into candidate_count
  from public.reyo_pack_skus sku
  left join public.reyo_pack_sku_barcodes barcode
    on barcode.workspace_id = sku.workspace_id
   and barcode.sku_id = sku.id
   and barcode.active = true
  where sku.workspace_id = p_workspace_id
    and sku.active = true
    and (
      barcode.barcode_normalized = normalized_barcode
      or sku.sku_normalized = upper(trim(p_barcode))
    );

  if candidate_count = 0 then
    return jsonb_build_object(
      'outcome', 'PRODUCT_NOT_FOUND',
      'barcode', normalized_barcode,
      'message', 'No active SKU or product barcode matches this scan.'
    );
  end if;
  if candidate_count > 1 then
    return jsonb_build_object(
      'outcome', 'AMBIGUOUS_PRODUCT',
      'barcode', normalized_barcode,
      'message', 'This SKU exists in more than one marketplace account. Scan its unique product barcode.'
    );
  end if;

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
      or sku.sku_normalized = upper(trim(p_barcode))
    )
  order by (barcode.barcode_normalized = normalized_barcode) desc
  limit 1;

  select * into target_assignment
  from public.reyo_pack_sku_locations assignment
  where assignment.workspace_id = p_workspace_id
    and assignment.sku_id = target_sku.id;
  if not found then
    return jsonb_build_object(
      'outcome', 'LOCATION_NOT_ASSIGNED',
      'skuId', target_sku.id,
      'sku', target_sku.sku,
      'productTitle', target_sku.product_title,
      'message', 'An administrator must assign this SKU to a location.'
    );
  end if;

  select * into target_location
  from public.reyo_pack_locations location
  where location.workspace_id = p_workspace_id
    and location.id = target_assignment.location_id
    and location.active = true;
  if not found then
    return jsonb_build_object(
      'outcome', 'LOCATION_INACTIVE',
      'skuId', target_sku.id,
      'sku', target_sku.sku,
      'message', 'The assigned location is inactive. Ask an administrator to reassign this SKU.'
    );
  end if;

  return jsonb_build_object(
    'outcome', 'PRODUCT_FOUND',
    'skuId', target_sku.id,
    'sku', target_sku.sku,
    'asin', target_sku.asin,
    'productTitle', target_sku.product_title,
    'size', target_sku.size_label,
    'locationId', target_location.id,
    'locationCode', target_location.code,
    'locationName', target_location.name,
    'locationType', target_location.location_type,
    'assignmentVersion', target_assignment.version,
    'expectedQuantity', target_assignment.expected_quantity
  );
end;
$$;

create or replace function public.confirm_reyo_putaway_sku(
  p_workspace_id uuid,
  p_actor_id uuid,
  p_session_id uuid,
  p_sku_id uuid,
  p_expected_location_id uuid,
  p_expected_assignment_version bigint,
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
  result_payload jsonb;
  confirmation_time timestamptz := now();
begin
  if p_quantity < 1 or p_quantity > 100000
     or char_length(coalesce(p_reason, '')) > 500
     or char_length(coalesce(p_idempotency_key, '')) not between 8 and 200 then
    raise exception using errcode = '22023', message = 'Invalid putaway confirmation.';
  end if;
  select metadata -> 'result' into result_payload
  from public.reyo_pack_putaway_events
  where workspace_id = p_workspace_id and idempotency_key = p_idempotency_key;
  if found then return result_payload; end if;

  select * into active_session
  from public.reyo_pack_sessions
  where workspace_id = p_workspace_id
    and id = p_session_id
    and started_by = p_actor_id
  for update;
  if not found or active_session.status <> 'ACTIVE' or active_session.mode <> 'PUTAWAY' then
    raise exception using errcode = '22023', message = 'An active putaway session is required.';
  end if;

  select * into target_sku
  from public.reyo_pack_skus
  where workspace_id = p_workspace_id and id = p_sku_id and active = true
  for share;
  if not found then
    raise exception using errcode = 'P0002', message = 'Active SKU not found.';
  end if;
  select * into target_assignment
  from public.reyo_pack_sku_locations
  where workspace_id = p_workspace_id and sku_id = p_sku_id
  for update;
  if not found then
    return jsonb_build_object(
      'outcome', 'LOCATION_NOT_ASSIGNED',
      'skuId', target_sku.id,
      'sku', target_sku.sku,
      'message', 'The SKU no longer has an assigned location.'
    );
  end if;
  select * into target_location
  from public.reyo_pack_locations
  where workspace_id = p_workspace_id and id = target_assignment.location_id
  for share;

  if target_assignment.version <> p_expected_assignment_version
     or target_assignment.location_id <> p_expected_location_id
     or target_location.active = false then
    return jsonb_build_object(
      'outcome', 'LOCATION_CHANGED',
      'skuId', target_sku.id,
      'sku', target_sku.sku,
      'locationId', target_location.id,
      'locationCode', target_location.code,
      'locationName', target_location.name,
      'assignmentVersion', target_assignment.version,
      'message', 'The SKU location changed after the scan. Follow the updated location and confirm again.'
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
    'confirmedAt', confirmation_time
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
      last_activity_at = confirmation_time,
      updated_at = confirmation_time
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

create or replace function public.save_reyo_pack_location(
  p_workspace_id uuid,
  p_actor_id uuid,
  p_location_id uuid,
  p_expected_version bigint,
  p_parent_id uuid,
  p_warehouse_id uuid,
  p_location_type text,
  p_code text,
  p_name text,
  p_sort_order integer,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_location public.reyo_pack_locations%rowtype;
  parent_location public.reyo_pack_locations%rowtype;
  saved_location public.reyo_pack_locations%rowtype;
  expected_parent_type text;
begin
  if p_location_type not in ('WAREHOUSE', 'RACK', 'SHELF', 'BIN')
     or char_length(trim(coalesce(p_code, ''))) not between 1 and 80
     or char_length(trim(coalesce(p_name, ''))) not between 1 and 200
     or p_sort_order < -100000 or p_sort_order > 100000 then
    raise exception using errcode = '22023', message = 'Invalid warehouse location.';
  end if;
  expected_parent_type := case p_location_type
    when 'WAREHOUSE' then null
    when 'RACK' then 'WAREHOUSE'
    when 'SHELF' then 'RACK'
    when 'BIN' then 'SHELF'
  end;
  if expected_parent_type is null and p_parent_id is not null then
    raise exception using errcode = '22023', message = 'Warehouse locations cannot have a parent.';
  end if;
  if expected_parent_type is not null then
    select * into parent_location
    from public.reyo_pack_locations
    where workspace_id = p_workspace_id and id = p_parent_id and active = true
    for share;
    if not found or parent_location.location_type <> expected_parent_type then
      raise exception using errcode = '22023', message = 'The location parent has the wrong hierarchy type.';
    end if;
  end if;
  if p_warehouse_id is not null and not exists (
    select 1 from public.warehouses warehouse
    where warehouse.workspace_id = p_workspace_id and warehouse.id = p_warehouse_id
  ) then
    raise exception using errcode = 'P0002', message = 'Warehouse not found.';
  end if;

  if p_location_id is null then
    if coalesce(p_expected_version, 0) <> 0 then
      raise exception using errcode = '40001', message = 'Location version conflict.';
    end if;
    insert into public.reyo_pack_locations (
      workspace_id, warehouse_id, parent_id, location_type, code, name,
      sort_order, active, created_by
    ) values (
      p_workspace_id, p_warehouse_id, p_parent_id, p_location_type,
      trim(p_code), trim(p_name), p_sort_order, p_active, p_actor_id
    ) returning * into saved_location;
  else
    select * into current_location
    from public.reyo_pack_locations
    where workspace_id = p_workspace_id and id = p_location_id
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'Location not found.';
    end if;
    if current_location.version <> p_expected_version then
      raise exception using errcode = '40001', message = 'Location version conflict.';
    end if;
    if current_location.location_type <> p_location_type and exists (
      select 1 from public.reyo_pack_locations child
      where child.workspace_id = p_workspace_id and child.parent_id = current_location.id
    ) then
      raise exception using errcode = '55000', message = 'A location with children cannot change hierarchy type.';
    end if;
    if p_active = false and (
      exists (
        select 1 from public.reyo_pack_locations child
        where child.workspace_id = p_workspace_id
          and child.parent_id = current_location.id and child.active = true
      )
      or exists (
        select 1 from public.reyo_pack_sku_locations assignment
        where assignment.workspace_id = p_workspace_id
          and assignment.location_id = current_location.id
      )
    ) then
      raise exception using errcode = '55000', message = 'Move active children and SKU assignments before deactivating this location.';
    end if;
    update public.reyo_pack_locations
    set warehouse_id = p_warehouse_id,
        parent_id = p_parent_id,
        location_type = p_location_type,
        code = trim(p_code),
        name = trim(p_name),
        sort_order = p_sort_order,
        active = p_active,
        version = version + 1,
        updated_at = now()
    where id = current_location.id
    returning * into saved_location;
  end if;

  insert into public.audit_events (
    workspace_id, actor_type, actor_id, action, resource_type, resource_id,
    previous_state, new_state, source
  ) values (
    p_workspace_id, 'human', p_actor_id,
    case when p_location_id is null then 'reyo_pack.location_created' else 'reyo_pack.location_updated' end,
    'reyo_pack_location', saved_location.id::text,
    case when p_location_id is null then null else jsonb_build_object(
      'parentId', current_location.parent_id,
      'code', current_location.code,
      'name', current_location.name,
      'type', current_location.location_type,
      'active', current_location.active,
      'version', current_location.version
    ) end,
    jsonb_build_object(
      'parentId', saved_location.parent_id,
      'code', saved_location.code,
      'name', saved_location.name,
      'type', saved_location.location_type,
      'active', saved_location.active,
      'version', saved_location.version
    ),
    'reyo_pack_admin_api'
  );
  return jsonb_build_object(
    'locationId', saved_location.id,
    'parentId', saved_location.parent_id,
    'warehouseId', saved_location.warehouse_id,
    'type', saved_location.location_type,
    'code', saved_location.code,
    'name', saved_location.name,
    'sortOrder', saved_location.sort_order,
    'active', saved_location.active,
    'version', saved_location.version,
    'updatedAt', saved_location.updated_at
  );
end;
$$;

create or replace function public.save_reyo_pack_settings(
  p_workspace_id uuid,
  p_actor_id uuid,
  p_expected_version bigint,
  p_sound_enabled boolean,
  p_vibration_enabled boolean,
  p_sound_volume numeric,
  p_scan_debounce_ms integer,
  p_claim_ttl_seconds integer,
  p_sync_interval_minutes integer,
  p_allow_manual_awb boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_setting public.reyo_pack_settings%rowtype;
  saved_setting public.reyo_pack_settings%rowtype;
begin
  if p_sound_volume < 0 or p_sound_volume > 1
     or p_scan_debounce_ms not between 250 and 10000
     or p_claim_ttl_seconds not between 30 and 600
     or p_sync_interval_minutes not between 5 and 1440 then
    raise exception using errcode = '22023', message = 'Invalid Reyo Pack settings.';
  end if;
  select * into current_setting
  from public.reyo_pack_settings
  where workspace_id = p_workspace_id
  for update;
  if found and current_setting.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'Settings version conflict.';
  end if;
  if not found and p_expected_version <> 0 then
    raise exception using errcode = '40001', message = 'Settings version conflict.';
  end if;

  insert into public.reyo_pack_settings (
    workspace_id, sound_enabled, vibration_enabled, sound_volume,
    scan_debounce_ms, claim_ttl_seconds, sync_interval_minutes,
    allow_manual_awb, updated_by
  ) values (
    p_workspace_id, p_sound_enabled, p_vibration_enabled, p_sound_volume,
    p_scan_debounce_ms, p_claim_ttl_seconds, p_sync_interval_minutes,
    p_allow_manual_awb, p_actor_id
  )
  on conflict (workspace_id) do update
  set sound_enabled = excluded.sound_enabled,
      vibration_enabled = excluded.vibration_enabled,
      sound_volume = excluded.sound_volume,
      scan_debounce_ms = excluded.scan_debounce_ms,
      claim_ttl_seconds = excluded.claim_ttl_seconds,
      sync_interval_minutes = excluded.sync_interval_minutes,
      allow_manual_awb = excluded.allow_manual_awb,
      updated_by = excluded.updated_by,
      updated_at = now(),
      version = public.reyo_pack_settings.version + 1
  returning * into saved_setting;

  insert into public.audit_events (
    workspace_id, actor_type, actor_id, action, resource_type, resource_id,
    previous_state, new_state, source
  ) values (
    p_workspace_id, 'human', p_actor_id, 'reyo_pack.settings_changed',
    'reyo_pack_settings', p_workspace_id::text,
    case when current_setting.workspace_id is null then null else to_jsonb(current_setting) - 'workspace_id' end,
    to_jsonb(saved_setting) - 'workspace_id',
    'reyo_pack_admin_api'
  );
  return to_jsonb(saved_setting) - 'workspace_id';
end;
$$;

create or replace function public.save_reyo_pack_sku(
  p_workspace_id uuid,
  p_actor_id uuid,
  p_sku_id uuid,
  p_expected_version bigint,
  p_marketplace_account_id uuid,
  p_sku text,
  p_asin text,
  p_product_title text,
  p_size_label text,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_sku public.reyo_pack_skus%rowtype;
  saved_sku public.reyo_pack_skus%rowtype;
begin
  if char_length(trim(coalesce(p_sku, ''))) not between 1 and 200
     or char_length(coalesce(p_asin, '')) > 20
     or char_length(coalesce(p_product_title, '')) > 10000
     or char_length(coalesce(p_size_label, '')) > 200 then
    raise exception using errcode = '22023', message = 'Invalid Reyo Pack SKU.';
  end if;
  if p_marketplace_account_id is not null and not exists (
    select 1 from public.marketplace_accounts account
    where account.workspace_id = p_workspace_id
      and account.id = p_marketplace_account_id
  ) then
    raise exception using errcode = 'P0002', message = 'Marketplace account not found.';
  end if;

  if p_sku_id is null then
    if coalesce(p_expected_version, 0) <> 0 then
      raise exception using errcode = '40001', message = 'SKU version conflict.';
    end if;
    insert into public.reyo_pack_skus (
      workspace_id, marketplace_account_id, sku, asin, product_title,
      size_label, source, source_updated_at, active, created_by
    ) values (
      p_workspace_id, p_marketplace_account_id, trim(p_sku),
      nullif(trim(coalesce(p_asin, '')), ''),
      nullif(trim(coalesce(p_product_title, '')), ''),
      nullif(trim(coalesce(p_size_label, '')), ''),
      'SELLER_ENTERED', now(), p_active, p_actor_id
    ) returning * into saved_sku;
  else
    select * into current_sku
    from public.reyo_pack_skus
    where workspace_id = p_workspace_id and id = p_sku_id
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'SKU not found.';
    end if;
    if current_sku.version <> p_expected_version then
      raise exception using errcode = '40001', message = 'SKU version conflict.';
    end if;
    update public.reyo_pack_skus
    set marketplace_account_id = p_marketplace_account_id,
        sku = trim(p_sku),
        asin = nullif(trim(coalesce(p_asin, '')), ''),
        product_title = nullif(trim(coalesce(p_product_title, '')), ''),
        size_label = nullif(trim(coalesce(p_size_label, '')), ''),
        source = 'SELLER_ENTERED',
        source_updated_at = now(),
        active = p_active,
        version = version + 1,
        updated_at = now()
    where id = current_sku.id
    returning * into saved_sku;
  end if;

  insert into public.audit_events (
    workspace_id, actor_type, actor_id, action, resource_type, resource_id,
    previous_state, new_state, source
  ) values (
    p_workspace_id, 'human', p_actor_id,
    case when p_sku_id is null then 'reyo_pack.sku_created' else 'reyo_pack.sku_updated' end,
    'reyo_pack_sku', saved_sku.id::text,
    case when p_sku_id is null then null else jsonb_build_object(
      'marketplaceAccountId', current_sku.marketplace_account_id,
      'sku', current_sku.sku,
      'asin', current_sku.asin,
      'productTitle', current_sku.product_title,
      'size', current_sku.size_label,
      'active', current_sku.active,
      'version', current_sku.version
    ) end,
    jsonb_build_object(
      'marketplaceAccountId', saved_sku.marketplace_account_id,
      'sku', saved_sku.sku,
      'asin', saved_sku.asin,
      'productTitle', saved_sku.product_title,
      'size', saved_sku.size_label,
      'active', saved_sku.active,
      'version', saved_sku.version
    ),
    'reyo_pack_admin_api'
  );
  return jsonb_build_object(
    'skuId', saved_sku.id,
    'marketplaceAccountId', saved_sku.marketplace_account_id,
    'sku', saved_sku.sku,
    'asin', saved_sku.asin,
    'productTitle', saved_sku.product_title,
    'size', saved_sku.size_label,
    'source', saved_sku.source,
    'active', saved_sku.active,
    'version', saved_sku.version,
    'updatedAt', saved_sku.updated_at
  );
end;
$$;

create or replace function public.replace_reyo_pack_sku_barcodes(
  p_workspace_id uuid,
  p_actor_id uuid,
  p_sku_id uuid,
  p_barcodes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_barcodes jsonb;
  new_barcodes jsonb;
begin
  if p_barcodes is null
     or jsonb_typeof(p_barcodes) <> 'array'
     or jsonb_array_length(p_barcodes) > 50 then
    raise exception using errcode = '22023', message = 'Invalid SKU barcode configuration.';
  end if;
  perform 1
  from public.reyo_pack_skus sku
  where sku.workspace_id = p_workspace_id and sku.id = p_sku_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'SKU not found.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_barcodes) as requested(barcode text, "barcodeType" text)
    where char_length(trim(coalesce(requested.barcode, ''))) not between 1 and 200
      or private.normalize_reyo_pack_barcode(requested.barcode) = ''
      or requested."barcodeType" not in (
        'EAN_8', 'EAN_13', 'UPC_A', 'UPC_E', 'CODE_39', 'CODE_128', 'ITF', 'OTHER'
      )
  ) then
    raise exception using errcode = '22023', message = 'Invalid SKU barcode configuration.';
  end if;
  if (
    select count(*)
    from jsonb_to_recordset(p_barcodes) as requested(barcode text, "barcodeType" text)
  ) <> (
    select count(distinct private.normalize_reyo_pack_barcode(requested.barcode))
    from jsonb_to_recordset(p_barcodes) as requested(barcode text, "barcodeType" text)
  ) then
    raise exception using errcode = '22023', message = 'Duplicate product barcodes are not allowed.';
  end if;
  if exists (
    select 1
    from public.reyo_pack_sku_barcodes existing
    join jsonb_to_recordset(p_barcodes) as requested(barcode text, "barcodeType" text)
      on existing.barcode_normalized = private.normalize_reyo_pack_barcode(requested.barcode)
    where existing.workspace_id = p_workspace_id
      and existing.active = true
      and existing.sku_id <> p_sku_id
  ) then
    raise exception using errcode = '23505', message = 'A product barcode is already assigned to another SKU.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'barcode', barcode.barcode,
    'barcodeType', barcode.barcode_type,
    'active', barcode.active
  ) order by barcode.created_at, barcode.id), '[]'::jsonb)
  into old_barcodes
  from public.reyo_pack_sku_barcodes barcode
  where barcode.workspace_id = p_workspace_id and barcode.sku_id = p_sku_id;

  update public.reyo_pack_sku_barcodes
  set active = false
  where workspace_id = p_workspace_id and sku_id = p_sku_id and active = true;

  insert into public.reyo_pack_sku_barcodes (
    workspace_id, sku_id, barcode, barcode_type, active, created_by
  )
  select p_workspace_id, p_sku_id, trim(requested.barcode),
         requested."barcodeType", true, p_actor_id
  from jsonb_to_recordset(p_barcodes) as requested(barcode text, "barcodeType" text)
  on conflict (workspace_id, barcode_normalized) do update
  set sku_id = excluded.sku_id,
      barcode = excluded.barcode,
      barcode_type = excluded.barcode_type,
      active = true,
      created_by = excluded.created_by;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', barcode.id,
    'barcode', barcode.barcode,
    'barcodeType', barcode.barcode_type
  ) order by barcode.created_at, barcode.id), '[]'::jsonb)
  into new_barcodes
  from public.reyo_pack_sku_barcodes barcode
  where barcode.workspace_id = p_workspace_id
    and barcode.sku_id = p_sku_id
    and barcode.active = true;

  insert into public.audit_events (
    workspace_id, actor_type, actor_id, action, resource_type, resource_id,
    previous_state, new_state, source
  ) values (
    p_workspace_id, 'human', p_actor_id, 'reyo_pack.sku_barcodes_changed',
    'reyo_pack_sku', p_sku_id::text,
    jsonb_build_object('barcodes', old_barcodes),
    jsonb_build_object('barcodes', new_barcodes),
    'reyo_pack_admin_api'
  );
  return jsonb_build_object('skuId', p_sku_id, 'barcodes', new_barcodes);
end;
$$;

create or replace function public.get_reyo_pack_skus_page(
  p_workspace_id uuid,
  p_search text default null,
  p_active boolean default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result_payload jsonb;
begin
  if char_length(coalesce(p_search, '')) > 200
     or p_limit < 1 or p_limit > 100
     or p_offset < 0 or p_offset > 1000000 then
    raise exception using errcode = '22023', message = 'Invalid SKU query.';
  end if;
  with sku_rows as (
    select sku.id, sku.marketplace_account_id, sku.sku, sku.asin,
           sku.product_title, sku.size_label, sku.source, sku.source_updated_at,
           sku.active, sku.version, sku.created_at, sku.updated_at,
           assignment.location_id, assignment.expected_quantity,
           assignment.version as assignment_version,
           location.code as location_code, location.name as location_name,
           coalesce(barcodes.items, '[]'::jsonb) as barcodes,
           count(*) over() as total_count,
           row_number() over(order by sku.sku_normalized, sku.id) as page_position
    from public.reyo_pack_skus sku
    left join public.reyo_pack_sku_locations assignment
      on assignment.workspace_id = sku.workspace_id and assignment.sku_id = sku.id
    left join public.reyo_pack_locations location
      on location.workspace_id = sku.workspace_id and location.id = assignment.location_id
    left join lateral (
      select jsonb_agg(jsonb_build_object(
        'id', barcode.id,
        'barcode', barcode.barcode,
        'barcodeType', barcode.barcode_type
      ) order by barcode.created_at, barcode.id) as items
      from public.reyo_pack_sku_barcodes barcode
      where barcode.workspace_id = p_workspace_id
        and barcode.sku_id = sku.id
        and barcode.active = true
    ) barcodes on true
    where sku.workspace_id = p_workspace_id
      and (p_active is null or sku.active = p_active)
      and (
        nullif(trim(coalesce(p_search, '')), '') is null
        or position(lower(trim(p_search)) in lower(sku.sku)) > 0
        or position(lower(trim(p_search)) in lower(coalesce(sku.asin, ''))) > 0
        or position(lower(trim(p_search)) in lower(coalesce(sku.product_title, ''))) > 0
      )
    order by sku.sku_normalized, sku.id
    limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'rows', coalesce(jsonb_agg(jsonb_build_object(
      'skuId', row.id,
      'marketplaceAccountId', row.marketplace_account_id,
      'sku', row.sku,
      'asin', row.asin,
      'productTitle', row.product_title,
      'size', row.size_label,
      'source', row.source,
      'sourceUpdatedAt', row.source_updated_at,
      'active', row.active,
      'version', row.version,
      'barcodes', row.barcodes,
      'locationId', row.location_id,
      'locationCode', row.location_code,
      'locationName', row.location_name,
      'expectedQuantity', row.expected_quantity,
      'assignmentVersion', row.assignment_version,
      'createdAt', row.created_at,
      'updatedAt', row.updated_at
    ) order by row.page_position), '[]'::jsonb),
    'total', coalesce(max(row.total_count), 0)
  ) into result_payload
  from sku_rows row;
  return result_payload;
end;
$$;

revoke all on function public.lookup_reyo_putaway_product(uuid, uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.confirm_reyo_putaway_sku(
  uuid, uuid, uuid, uuid, uuid, bigint, integer, text, text
) from public, anon, authenticated;
revoke all on function public.save_reyo_pack_location(
  uuid, uuid, uuid, bigint, uuid, uuid, text, text, text, integer, boolean
) from public, anon, authenticated;
revoke all on function public.save_reyo_pack_settings(
  uuid, uuid, bigint, boolean, boolean, numeric, integer, integer, integer, boolean
) from public, anon, authenticated;
revoke all on function public.save_reyo_pack_sku(
  uuid, uuid, uuid, bigint, uuid, text, text, text, text, boolean
) from public, anon, authenticated;
revoke all on function public.replace_reyo_pack_sku_barcodes(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.get_reyo_pack_skus_page(uuid, text, boolean, integer, integer)
  from public, anon, authenticated;

grant execute on function public.lookup_reyo_putaway_product(uuid, uuid, uuid, text)
  to service_role;
grant execute on function public.confirm_reyo_putaway_sku(
  uuid, uuid, uuid, uuid, uuid, bigint, integer, text, text
) to service_role;
grant execute on function public.save_reyo_pack_location(
  uuid, uuid, uuid, bigint, uuid, uuid, text, text, text, integer, boolean
) to service_role;
grant execute on function public.save_reyo_pack_settings(
  uuid, uuid, bigint, boolean, boolean, numeric, integer, integer, integer, boolean
) to service_role;
grant execute on function public.save_reyo_pack_sku(
  uuid, uuid, uuid, bigint, uuid, text, text, text, text, boolean
) to service_role;
grant execute on function public.replace_reyo_pack_sku_barcodes(uuid, uuid, uuid, jsonb)
  to service_role;
grant execute on function public.get_reyo_pack_skus_page(uuid, text, boolean, integer, integer)
  to service_role;

notify pgrst, 'reload schema';
commit;
