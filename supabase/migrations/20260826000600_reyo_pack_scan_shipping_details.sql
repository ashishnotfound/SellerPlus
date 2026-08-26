-- Enrich the atomic barcode claim response with Amazon-sourced package details.
-- The existing claim function remains the state-transition authority; this
-- wrapper only adds fields after the same transaction has claimed the shipment.

begin;

create or replace function public.claim_reyo_pack_shipment_with_details(
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
  result_payload jsonb;
  target_shipment_id uuid;
  package_details record;
begin
  result_payload := public.claim_reyo_pack_shipment(
    p_workspace_id,
    p_actor_id,
    p_session_id,
    p_barcode,
    p_idempotency_key,
    p_marketplace_account_id
  );

  target_shipment_id := nullif(result_payload ->> 'shipmentId', '')::uuid;
  if target_shipment_id is null then
    return result_payload;
  end if;

  select
    shipment.tracking_number,
    shipment.carrier,
    shipment.shipping_service,
    shipment.status as amazon_package_status,
    shipment.amazon_package_status_detail,
    shipment.amazon_ship_time
  into package_details
  from public.shipments shipment
  where shipment.workspace_id = p_workspace_id
    and shipment.id = target_shipment_id;

  if not found then
    return result_payload;
  end if;

  return result_payload || jsonb_build_object(
    'trackingNumber', package_details.tracking_number,
    'carrier', package_details.carrier,
    'shippingService', package_details.shipping_service,
    'amazonPackageStatus', package_details.amazon_package_status,
    'amazonPackageStatusDetail', package_details.amazon_package_status_detail,
    'amazonShipTime', package_details.amazon_ship_time
  );
end;
$$;

revoke all on function public.claim_reyo_pack_shipment_with_details(
  uuid, uuid, uuid, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.claim_reyo_pack_shipment_with_details(
  uuid, uuid, uuid, text, text, uuid
) to service_role;

notify pgrst, 'reload schema';
commit;
