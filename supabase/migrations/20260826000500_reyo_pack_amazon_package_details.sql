-- Preserve the additional package fields exposed by Orders API v2026-01-01.
-- packageReferenceId is intentionally retained as Amazon's package reference;
-- it is not relabeled as an External Fulfillment shipment id.

begin;

alter table public.shipments
  add column if not exists amazon_package_status_detail text,
  add column if not exists amazon_ship_time timestamptz,
  add column if not exists amazon_ship_from_address jsonb;

create or replace function public.update_reyo_pack_amazon_package_details(
  p_workspace_id uuid,
  p_shipment_id uuid,
  p_status_detail text,
  p_ship_time timestamptz,
  p_ship_from_address jsonb,
  p_source_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.shipments%rowtype;
begin
  if p_source_updated_at is null
     or char_length(coalesce(p_status_detail, '')) > 200
     or (p_ship_from_address is not null and jsonb_typeof(p_ship_from_address) <> 'object') then
    raise exception using errcode = '22023', message = 'Invalid Amazon package details.';
  end if;

  select * into target
  from public.shipments shipment
  where shipment.workspace_id = p_workspace_id
    and shipment.id = p_shipment_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Amazon package shipment not found.';
  end if;

  if target.source_updated_at is not null and target.source_updated_at > p_source_updated_at then
    return jsonb_build_object('outcome', 'STALE_IGNORED', 'shipmentId', target.id);
  end if;

  update public.shipments
  set amazon_package_status_detail = coalesce(nullif(trim(p_status_detail), ''), amazon_package_status_detail),
      amazon_ship_time = coalesce(p_ship_time, amazon_ship_time),
      amazon_ship_from_address = coalesce(p_ship_from_address, amazon_ship_from_address),
      source_updated_at = p_source_updated_at,
      updated_at = now()
  where id = target.id
    and workspace_id = p_workspace_id;

  return jsonb_build_object('outcome', 'UPDATED', 'shipmentId', target.id);
end;
$$;

revoke all on function public.update_reyo_pack_amazon_package_details(
  uuid, uuid, text, timestamptz, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.update_reyo_pack_amazon_package_details(
  uuid, uuid, text, timestamptz, jsonb, timestamptz
) to service_role;

notify pgrst, 'reload schema';
commit;
