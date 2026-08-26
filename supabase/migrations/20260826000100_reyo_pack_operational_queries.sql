-- Reyo Pack bounded operational read models

begin;

alter table public.orders
  add column if not exists packing_priority smallint not null default 0;
alter table public.orders
  drop constraint if exists orders_packing_priority_check;
alter table public.orders
  add constraint orders_packing_priority_check
  check (packing_priority between 0 and 100);

create index if not exists idx_orders_workspace_pack_priority_ship_by
  on public.orders(workspace_id, packing_priority desc, ship_by_date, purchase_date)
  where cancellation_status = 'NOT_CANCELLED';

create or replace function public.get_reyo_pack_queue_page(
  p_workspace_id uuid,
  p_status text default 'UNPACKED',
  p_search text default null,
  p_sort text default 'ship_by',
  p_ascending boolean default true,
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
  if p_status not in ('UNPACKED', 'PACKING', 'PACKED', 'CANCELLED', 'ERROR')
     or p_sort not in ('ship_by', 'order_date', 'sku', 'product', 'quantity', 'priority')
     or p_limit < 1 or p_limit > 100
     or p_offset < 0 or p_offset > 1000000
     or char_length(coalesce(p_search, '')) > 200 then
    raise exception using errcode = '22023', message = 'Invalid Reyo Pack queue query.';
  end if;

  with queue_rows as (
    select
      shipment.id as shipment_id,
      shipment.marketplace_account_id,
      shipment.awb_code,
      shipment.tracking_number,
      shipment.carrier,
      shipment.shipping_service,
      shipment.packing_status,
      shipment.packing_claim_expires_at,
      shipment.packed_at,
      shipment.updated_at,
      parent_order.id as order_id,
      parent_order.channel_order_id as amazon_order_id,
      parent_order.purchase_date,
      parent_order.ship_by_date,
      parent_order.shipping_service_level,
      parent_order.packing_priority,
      parent_order.cancellation_status,
      parent_order.cancelled_at,
      item_summary.items,
      item_summary.unit_count,
      item_summary.sort_sku,
      item_summary.sort_product,
      exists (
        select 1
        from public.reyo_pack_label_documents label
        where label.workspace_id = p_workspace_id
          and label.shipment_id = shipment.id
      ) as label_available,
      count(*) over() as total_count,
      row_number() over (order by
        case when p_sort = 'ship_by' and p_ascending then parent_order.ship_by_date end asc nulls last,
        case when p_sort = 'ship_by' and not p_ascending then parent_order.ship_by_date end desc nulls last,
        case when p_sort = 'order_date' and p_ascending then parent_order.purchase_date end asc nulls last,
        case when p_sort = 'order_date' and not p_ascending then parent_order.purchase_date end desc nulls last,
        case when p_sort = 'sku' and p_ascending then item_summary.sort_sku end asc nulls last,
        case when p_sort = 'sku' and not p_ascending then item_summary.sort_sku end desc nulls last,
        case when p_sort = 'product' and p_ascending then item_summary.sort_product end asc nulls last,
        case when p_sort = 'product' and not p_ascending then item_summary.sort_product end desc nulls last,
        case when p_sort = 'quantity' and p_ascending then item_summary.unit_count end asc nulls last,
        case when p_sort = 'quantity' and not p_ascending then item_summary.unit_count end desc nulls last,
        case when p_sort = 'priority' and p_ascending then parent_order.packing_priority end asc,
        case when p_sort = 'priority' and not p_ascending then parent_order.packing_priority end desc,
        parent_order.ship_by_date asc nulls last,
        shipment.id asc
      ) as page_position
    from public.shipments shipment
    join public.orders parent_order
      on parent_order.workspace_id = shipment.workspace_id
     and parent_order.id = shipment.order_id
    left join lateral (
      select
        coalesce(jsonb_agg(jsonb_build_object(
          'orderItemId', item.id,
          'sku', item.seller_sku,
          'asin', item.asin,
          'title', coalesce(catalog.product_title, item.title),
          'size', catalog.size_label,
          'quantity', coalesce(allocation.quantity, item.quantity_remaining),
          'quantityRemaining', item.quantity_remaining
        ) order by item.created_at, item.id), '[]'::jsonb) as items,
        coalesce(sum(coalesce(allocation.quantity, item.quantity_remaining)), 0)::integer as unit_count,
        min(coalesce(item.seller_sku, '')) as sort_sku,
        min(coalesce(catalog.product_title, item.title, '')) as sort_product
      from public.order_items item
      left join public.reyo_pack_shipment_items allocation
        on allocation.workspace_id = p_workspace_id
       and allocation.shipment_id = shipment.id
       and allocation.order_item_id = item.id
      left join public.reyo_pack_skus catalog
        on catalog.workspace_id = p_workspace_id
       and catalog.id = item.reyo_pack_sku_id
      where item.workspace_id = p_workspace_id
        and item.order_id = parent_order.id
        and (
          allocation.id is not null
          or not exists (
            select 1
            from public.reyo_pack_shipment_items any_allocation
            where any_allocation.workspace_id = p_workspace_id
              and any_allocation.shipment_id = shipment.id
          )
        )
    ) item_summary on true
    where shipment.workspace_id = p_workspace_id
      and shipment.packing_status = p_status
      and (
        nullif(trim(coalesce(p_search, '')), '') is null
        or position(lower(trim(p_search)) in lower(coalesce(parent_order.channel_order_id, ''))) > 0
        or position(lower(trim(p_search)) in lower(coalesce(shipment.awb_code, ''))) > 0
        or exists (
          select 1
          from public.order_items searched_item
          left join public.reyo_pack_skus searched_catalog
            on searched_catalog.workspace_id = p_workspace_id
           and searched_catalog.id = searched_item.reyo_pack_sku_id
          where searched_item.workspace_id = p_workspace_id
            and searched_item.order_id = parent_order.id
            and (
              position(lower(trim(p_search)) in lower(coalesce(searched_item.seller_sku, ''))) > 0
              or position(lower(trim(p_search)) in lower(coalesce(searched_catalog.product_title, searched_item.title, ''))) > 0
            )
        )
      )
    order by
      case when p_sort = 'ship_by' and p_ascending then parent_order.ship_by_date end asc nulls last,
      case when p_sort = 'ship_by' and not p_ascending then parent_order.ship_by_date end desc nulls last,
      case when p_sort = 'order_date' and p_ascending then parent_order.purchase_date end asc nulls last,
      case when p_sort = 'order_date' and not p_ascending then parent_order.purchase_date end desc nulls last,
      case when p_sort = 'sku' and p_ascending then item_summary.sort_sku end asc nulls last,
      case when p_sort = 'sku' and not p_ascending then item_summary.sort_sku end desc nulls last,
      case when p_sort = 'product' and p_ascending then item_summary.sort_product end asc nulls last,
      case when p_sort = 'product' and not p_ascending then item_summary.sort_product end desc nulls last,
      case when p_sort = 'quantity' and p_ascending then item_summary.unit_count end asc nulls last,
      case when p_sort = 'quantity' and not p_ascending then item_summary.unit_count end desc nulls last,
      case when p_sort = 'priority' and p_ascending then parent_order.packing_priority end asc,
      case when p_sort = 'priority' and not p_ascending then parent_order.packing_priority end desc,
      parent_order.ship_by_date asc nulls last,
      shipment.id asc
    limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'rows', coalesce(jsonb_agg(jsonb_build_object(
      'shipmentId', row.shipment_id,
      'marketplaceAccountId', row.marketplace_account_id,
      'orderId', row.order_id,
      'amazonOrderId', row.amazon_order_id,
      'awb', row.awb_code,
      'trackingNumber', row.tracking_number,
      'carrier', row.carrier,
      'shippingService', coalesce(row.shipping_service, row.shipping_service_level),
      'packingStatus', row.packing_status,
      'packingClaimExpiresAt', row.packing_claim_expires_at,
      'purchaseDate', row.purchase_date,
      'shipByDate', row.ship_by_date,
      'priority', row.packing_priority,
      'packedAt', row.packed_at,
      'cancelledAt', row.cancelled_at,
      'labelAvailable', row.label_available,
      'unitCount', row.unit_count,
      'items', row.items,
      'updatedAt', row.updated_at
    ) order by row.page_position), '[]'::jsonb),
    'total', coalesce(max(row.total_count), 0)
  ) into result_payload
  from queue_rows row;

  return result_payload;
end;
$$;

create or replace function public.get_reyo_pack_history_page(
  p_workspace_id uuid,
  p_status text default null,
  p_search text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
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
  if (p_status is not null and p_status not in ('UNPACKED', 'PACKING', 'PACKED', 'CANCELLED', 'ERROR'))
     or p_limit < 1 or p_limit > 100
     or p_offset < 0 or p_offset > 1000000
     or char_length(coalesce(p_search, '')) > 200
     or (p_from is not null and p_to is not null and p_from > p_to) then
    raise exception using errcode = '22023', message = 'Invalid Reyo Pack history query.';
  end if;

  with history_rows as (
    select
      shipment.id as shipment_id,
      shipment.awb_code,
      shipment.packing_status,
      shipment.packed_at,
      shipment.updated_at,
      parent_order.id as order_id,
      parent_order.channel_order_id as amazon_order_id,
      parent_order.purchase_date,
      parent_order.cancelled_at,
      parent_order.cancellation_reason,
      item_summary.items,
      item_summary.unit_count,
      packed_event.session_id,
      packed_event.event_created_at as packed_event_at,
      packed_event.session_number,
      count(*) over() as total_count,
      row_number() over (
        order by coalesce(shipment.packed_at, parent_order.cancelled_at, shipment.updated_at) desc,
                 shipment.id desc
      ) as page_position
    from public.shipments shipment
    join public.orders parent_order
      on parent_order.workspace_id = shipment.workspace_id
     and parent_order.id = shipment.order_id
    left join lateral (
      select
        coalesce(jsonb_agg(jsonb_build_object(
          'sku', item.seller_sku,
          'asin', item.asin,
          'title', coalesce(catalog.product_title, item.title),
          'size', catalog.size_label,
          'quantity', coalesce(allocation.quantity, item.quantity_ordered)
        ) order by item.created_at, item.id), '[]'::jsonb) as items,
        coalesce(sum(coalesce(allocation.quantity, item.quantity_ordered)), 0)::integer as unit_count
      from public.order_items item
      left join public.reyo_pack_shipment_items allocation
        on allocation.workspace_id = p_workspace_id
       and allocation.shipment_id = shipment.id
       and allocation.order_item_id = item.id
      left join public.reyo_pack_skus catalog
        on catalog.workspace_id = p_workspace_id
       and catalog.id = item.reyo_pack_sku_id
      where item.workspace_id = p_workspace_id
        and item.order_id = parent_order.id
        and (
          allocation.id is not null
          or not exists (
            select 1 from public.reyo_pack_shipment_items any_allocation
            where any_allocation.workspace_id = p_workspace_id
              and any_allocation.shipment_id = shipment.id
          )
        )
    ) item_summary on true
    left join lateral (
      select event.session_id, event.created_at as event_created_at,
             session.session_number
      from public.reyo_pack_packing_events event
      left join public.reyo_pack_sessions session
        on session.workspace_id = event.workspace_id
       and session.id = event.session_id
      where event.workspace_id = p_workspace_id
        and event.shipment_id = shipment.id
        and event.event_type = 'PACK_CONFIRMED'
      order by event.created_at desc
      limit 1
    ) packed_event on true
    where shipment.workspace_id = p_workspace_id
      and (p_status is null or shipment.packing_status = p_status)
      and (p_from is null or shipment.updated_at >= p_from)
      and (p_to is null or shipment.updated_at < p_to)
      and (
        nullif(trim(coalesce(p_search, '')), '') is null
        or position(lower(trim(p_search)) in lower(coalesce(parent_order.channel_order_id, ''))) > 0
        or position(lower(trim(p_search)) in lower(coalesce(shipment.awb_code, ''))) > 0
        or exists (
          select 1
          from public.order_items searched_item
          left join public.reyo_pack_skus searched_catalog
            on searched_catalog.workspace_id = p_workspace_id
           and searched_catalog.id = searched_item.reyo_pack_sku_id
          where searched_item.workspace_id = p_workspace_id
            and searched_item.order_id = parent_order.id
            and (
              position(lower(trim(p_search)) in lower(coalesce(searched_item.seller_sku, ''))) > 0
              or position(lower(trim(p_search)) in lower(coalesce(searched_catalog.product_title, searched_item.title, ''))) > 0
            )
        )
      )
    order by coalesce(shipment.packed_at, parent_order.cancelled_at, shipment.updated_at) desc,
             shipment.id desc
    limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'rows', coalesce(jsonb_agg(jsonb_build_object(
      'shipmentId', row.shipment_id,
      'orderId', row.order_id,
      'amazonOrderId', row.amazon_order_id,
      'awb', row.awb_code,
      'status', row.packing_status,
      'items', row.items,
      'unitCount', row.unit_count,
      'createdAt', row.purchase_date,
      'packedAt', coalesce(row.packed_event_at, row.packed_at),
      'cancelledAt', row.cancelled_at,
      'cancellationReason', row.cancellation_reason,
      'sessionId', row.session_id,
      'sessionNumber', row.session_number,
      'updatedAt', row.updated_at
    ) order by row.page_position), '[]'::jsonb),
    'total', coalesce(max(row.total_count), 0)
  ) into result_payload
  from history_rows row;

  return result_payload;
end;
$$;

revoke all on function public.get_reyo_pack_queue_page(
  uuid, text, text, text, boolean, integer, integer
) from public, anon, authenticated;
revoke all on function public.get_reyo_pack_history_page(
  uuid, text, text, timestamptz, timestamptz, integer, integer
) from public, anon, authenticated;
grant execute on function public.get_reyo_pack_queue_page(
  uuid, text, text, text, boolean, integer, integer
) to service_role;
grant execute on function public.get_reyo_pack_history_page(
  uuid, text, text, timestamptz, timestamptz, integer, integer
) to service_role;

notify pgrst, 'reload schema';
commit;
