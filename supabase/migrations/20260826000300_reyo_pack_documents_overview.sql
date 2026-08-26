-- Reyo Pack secure document access support and bounded admin overview

begin;

create or replace function public.get_reyo_pack_admin_overview(
  p_workspace_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with bounds as (
    select date_trunc('day', now() at time zone 'UTC') at time zone 'UTC' as window_start
  )
  select jsonb_build_object(
    'generatedAt', now(),
    'windowStart', bounds.window_start,
    'todayOrders', (
      select count(*)
      from public.orders order_record
      where order_record.workspace_id = p_workspace_id
        and order_record.purchase_date >= bounds.window_start
    ),
    'unpackedOrders', (
      select count(distinct shipment.order_id)
      from public.shipments shipment
      join public.orders order_record
        on order_record.workspace_id = shipment.workspace_id
       and order_record.id = shipment.order_id
      where shipment.workspace_id = p_workspace_id
        and shipment.packing_status in ('UNPACKED', 'PACKING')
        and order_record.cancellation_status = 'NOT_CANCELLED'
    ),
    'packedOrders', (
      select count(*)
      from public.orders order_record
      where order_record.workspace_id = p_workspace_id
        and order_record.cancellation_status = 'NOT_CANCELLED'
        and exists (
          select 1 from public.shipments shipment
          where shipment.workspace_id = order_record.workspace_id
            and shipment.order_id = order_record.id
        )
        and not exists (
          select 1 from public.shipments shipment
          where shipment.workspace_id = order_record.workspace_id
            and shipment.order_id = order_record.id
            and shipment.packing_status <> 'PACKED'
        )
    ),
    'cancelledOrders', (
      select count(*)
      from public.orders order_record
      where order_record.workspace_id = p_workspace_id
        and order_record.cancellation_status = 'CANCELLED'
    ),
    'currentSessions', (
      select count(*)
      from public.reyo_pack_sessions session
      where session.workspace_id = p_workspace_id
        and session.status = 'ACTIVE'
    ),
    'currentPackingSessions', (
      select count(*)
      from public.reyo_pack_sessions session
      where session.workspace_id = p_workspace_id
        and session.status = 'ACTIVE'
        and session.mode = 'PACKING'
    ),
    'currentPutawaySessions', (
      select count(*)
      from public.reyo_pack_sessions session
      where session.workspace_id = p_workspace_id
        and session.status = 'ACTIVE'
        and session.mode = 'PUTAWAY'
    ),
    'packagesPacked', (
      select count(*)
      from public.reyo_pack_packing_events event
      where event.workspace_id = p_workspace_id
        and event.event_type = 'PACK_CONFIRMED'
        and event.created_at >= bounds.window_start
    ),
    'unitsPacked', (
      select coalesce(sum(event.quantity), 0)
      from public.reyo_pack_packing_events event
      where event.workspace_id = p_workspace_id
        and event.event_type = 'PACK_CONFIRMED'
        and event.created_at >= bounds.window_start
    ),
    'putawayActions', (
      select count(*)
      from public.reyo_pack_putaway_events event
      where event.workspace_id = p_workspace_id
        and event.event_type = 'CONFIRMED'
        and event.created_at >= bounds.window_start
    )
  )
  from bounds;
$$;

revoke all on function public.get_reyo_pack_admin_overview(uuid)
  from public, anon, authenticated;
grant execute on function public.get_reyo_pack_admin_overview(uuid)
  to service_role;

notify pgrst, 'reload schema';
commit;
