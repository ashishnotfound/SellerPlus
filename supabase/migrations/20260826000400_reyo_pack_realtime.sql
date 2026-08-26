-- Tenant-authorized low-payload broadcasts for Reyo Pack state changes.
-- Clients receive a signal and re-read the bounded server read model; no
-- shipment/order/PII row is sent through Realtime.

begin;

create or replace function public.broadcast_reyo_pack_state_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace_id uuid;
  record_id text;
begin
  if tg_op = 'DELETE' then
    workspace_id := old.workspace_id;
    record_id := old.id::text;
  else
    workspace_id := new.workspace_id;
    record_id := new.id::text;
  end if;

  if workspace_id is not null then
    perform realtime.send(
      jsonb_build_object(
        'table', tg_table_name,
        'operation', tg_op,
        'recordId', record_id,
        'changedAt', now()
      ),
      'STATE_CHANGED',
      'reyo-pack:' || workspace_id::text,
      true
    );
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.broadcast_reyo_pack_state_change()
  from public, anon, authenticated;
grant execute on function public.broadcast_reyo_pack_state_change()
  to service_role;

drop trigger if exists reyo_pack_shipments_broadcast on public.shipments;
create trigger reyo_pack_shipments_broadcast
  after insert or update or delete on public.shipments
  for each row execute function public.broadcast_reyo_pack_state_change();

drop trigger if exists reyo_pack_orders_broadcast on public.orders;
create trigger reyo_pack_orders_broadcast
  after insert or update or delete on public.orders
  for each row execute function public.broadcast_reyo_pack_state_change();

drop trigger if exists reyo_pack_packing_events_broadcast on public.reyo_pack_packing_events;
create trigger reyo_pack_packing_events_broadcast
  after insert or update or delete on public.reyo_pack_packing_events
  for each row execute function public.broadcast_reyo_pack_state_change();

drop trigger if exists reyo_pack_sessions_broadcast on public.reyo_pack_sessions;
create trigger reyo_pack_sessions_broadcast
  after insert or update or delete on public.reyo_pack_sessions
  for each row execute function public.broadcast_reyo_pack_state_change();

drop trigger if exists reyo_pack_locations_broadcast on public.reyo_pack_locations;
create trigger reyo_pack_locations_broadcast
  after insert or update or delete on public.reyo_pack_locations
  for each row execute function public.broadcast_reyo_pack_state_change();

drop trigger if exists reyo_pack_sku_locations_broadcast on public.reyo_pack_sku_locations;
create trigger reyo_pack_sku_locations_broadcast
  after insert or update or delete on public.reyo_pack_sku_locations
  for each row execute function public.broadcast_reyo_pack_state_change();

drop trigger if exists reyo_pack_skus_broadcast on public.reyo_pack_skus;
create trigger reyo_pack_skus_broadcast
  after insert or update or delete on public.reyo_pack_skus
  for each row execute function public.broadcast_reyo_pack_state_change();

drop trigger if exists reyo_pack_putaway_events_broadcast on public.reyo_pack_putaway_events;
create trigger reyo_pack_putaway_events_broadcast
  after insert or update or delete on public.reyo_pack_putaway_events
  for each row execute function public.broadcast_reyo_pack_state_change();

drop policy if exists reyo_pack_workspace_broadcast_read on realtime.messages;
create policy reyo_pack_workspace_broadcast_read
  on realtime.messages
  for select
  to authenticated
  using (
    extension = 'broadcast'
    and realtime.topic() ~ '^reyo-pack:[0-9a-fA-F-]{36}$'
    and private.is_workspace_member((split_part(realtime.topic(), ':', 2))::uuid)
  );

notify pgrst, 'reload schema';
commit;
