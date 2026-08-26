begin;

create extension if not exists pgtap with schema extensions;
select plan(29);

insert into auth.users (
  id, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, aud, role
) values
  ('10000000-0000-0000-0000-000000000001', 'tenant-a@sellerplus.test', '', now(), '{}', '{}', 'authenticated', 'authenticated'),
  ('20000000-0000-0000-0000-000000000002', 'tenant-b@sellerplus.test', '', now(), '{}', '{}', 'authenticated', 'authenticated');

insert into public.profiles (id, email, full_name) values
  ('10000000-0000-0000-0000-000000000001', 'tenant-a@sellerplus.test', 'Tenant A'),
  ('20000000-0000-0000-0000-000000000002', 'tenant-b@sellerplus.test', 'Tenant B');

insert into public.workspaces (id, name, owner_id) values
  ('11000000-0000-0000-0000-000000000011', 'Workspace A', '10000000-0000-0000-0000-000000000001'),
  ('22000000-0000-0000-0000-000000000022', 'Workspace B', '20000000-0000-0000-0000-000000000002');

insert into public.workspace_members (workspace_id, user_id, role) values
  ('11000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', 'owner'),
  ('22000000-0000-0000-0000-000000000022', '20000000-0000-0000-0000-000000000002', 'owner');

insert into public.products (id, workspace_id, user_id, sku, name) values
  ('11100000-0000-0000-0000-000000000111', '11000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', 'TENANT-A-SKU', 'Tenant A Product'),
  ('22200000-0000-0000-0000-000000000222', '22000000-0000-0000-0000-000000000022', '20000000-0000-0000-0000-000000000002', 'TENANT-B-SKU', 'Tenant B Product');

insert into public.jobs (
  id, workspace_id, user_id, job_type, payload, status, idempotency_key
) values
  ('11110000-0000-0000-0000-000000001111', '11000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', 'test_job', '{}', 'queued', 'tenant-a-job'),
  ('22220000-0000-0000-0000-000000002222', '22000000-0000-0000-0000-000000000022', '20000000-0000-0000-0000-000000000002', 'test_job', '{}', 'queued', 'tenant-b-job');

insert into public.ai_memories (
  id, workspace_id, scope_type, memory_key, value, source, created_by
) values
  ('11111000-0000-0000-0000-000000011111', '11000000-0000-0000-0000-000000000011', 'workspace', 'brand_voice', '{"tone":"direct"}', 'seller', '10000000-0000-0000-0000-000000000001'),
  ('22222000-0000-0000-0000-000000022222', '22000000-0000-0000-0000-000000000022', 'workspace', 'brand_voice', '{"tone":"warm"}', 'seller', '20000000-0000-0000-0000-000000000002');

insert into public.orders (
  id, workspace_id, user_id, channel, channel_order_id, status, total_amount, currency
) values
  ('11111100-0000-0000-0000-000000111111', '11000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', 'amazon', 'TENANT-A-ORDER', 'pending', 100, 'INR'),
  ('22222200-0000-0000-0000-000000222222', '22000000-0000-0000-0000-000000000022', '20000000-0000-0000-0000-000000000002', 'amazon', 'TENANT-B-ORDER', 'pending', 200, 'INR');

insert into public.reyo_pack_sessions (
  id, workspace_id, mode, status, started_by, client_session_id
) values
  ('11111101-0000-0000-0000-000000111111', '11000000-0000-0000-0000-000000000011', 'PACKING', 'COMPLETED', '10000000-0000-0000-0000-000000000001', '11111101-1000-0000-0000-000000111111'),
  ('22222202-0000-0000-0000-000000222222', '22000000-0000-0000-0000-000000000022', 'PACKING', 'COMPLETED', '20000000-0000-0000-0000-000000000002', '22222202-2000-0000-0000-000000222222');

insert into public.shipments (
  id, workspace_id, order_id, carrier, status, awb_code, packing_status
) values
  ('11111102-0000-0000-0000-000000111111', '11000000-0000-0000-0000-000000000011', '11111100-0000-0000-0000-000000111111', 'Amazon', 'ReadyForPickup', 'AWB-TENANT-A', 'PACKED'),
  ('22222203-0000-0000-0000-000000222222', '22000000-0000-0000-0000-000000000022', '22222200-0000-0000-0000-000000222222', 'Amazon', 'ReadyForPickup', 'AWB-TENANT-B', 'PACKED');

insert into public.reyo_pack_packing_events (
  id, workspace_id, order_id, shipment_id, session_id, actor_id,
  event_type, awb, quantity, previous_status, new_status, idempotency_key
) values
  ('11111103-0000-0000-0000-000000111111', '11000000-0000-0000-0000-000000000011', '11111100-0000-0000-0000-000000111111', '11111102-0000-0000-0000-000000111111', '11111101-0000-0000-0000-000000111111', '10000000-0000-0000-0000-000000000001', 'PACK_CONFIRMED', 'AWB-TENANT-A', 1, 'PACKING', 'PACKED', 'tenant-a-packing-event'),
  ('22222204-0000-0000-0000-000000222222', '22000000-0000-0000-0000-000000000022', '22222200-0000-0000-0000-000000222222', '22222203-0000-0000-0000-000000222222', '22222202-0000-0000-0000-000000222222', '20000000-0000-0000-0000-000000000002', 'PACK_CONFIRMED', 'AWB-TENANT-B', 1, 'PACKING', 'PACKED', 'tenant-b-packing-event');

insert into public.reyo_pack_locations (
  id, workspace_id, location_type, code, name, created_by
) values
  ('11111104-0000-0000-0000-000000111111', '11000000-0000-0000-0000-000000000011', 'BIN', 'A-01-01', 'Tenant A Bin', '10000000-0000-0000-0000-000000000001'),
  ('22222205-0000-0000-0000-000000222222', '22000000-0000-0000-0000-000000000022', 'BIN', 'B-01-01', 'Tenant B Bin', '20000000-0000-0000-0000-000000000002');

insert into public.reyo_pack_label_documents (
  id, workspace_id, shipment_id, external_document_reference, document_source
) values
  ('11111105-0000-0000-0000-000000111111', '11000000-0000-0000-0000-000000000011', '11111102-0000-0000-0000-000000111111', 'sensitive-label-reference-a', 'LEGACY'),
  ('22222206-0000-0000-0000-000000222222', '22000000-0000-0000-0000-000000000022', '22222203-0000-0000-0000-000000222222', 'sensitive-label-reference-b', 'LEGACY');

insert into public.ai_schedules (
  id, workspace_id, user_id, title, task_type, cron_schedule, status, next_run
) values
  ('11111110-0000-0000-0000-000000111111', '11000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', 'Tenant A Report', 'generate_report', '0 9 * * *', 'active', now() + interval '1 hour'),
  ('22222220-0000-0000-0000-000000222222', '22000000-0000-0000-0000-000000000022', '20000000-0000-0000-0000-000000000002', 'Tenant B Report', 'generate_report', '0 9 * * *', 'active', now() + interval '1 hour');

insert into public.marketplace_accounts (
  id, workspace_id, platform, region, marketplace_id, seller_account_id, display_name, status, created_by
) values
  ('11111111-1000-0000-0000-000000111111', '11000000-0000-0000-0000-000000000011', 'amazon', 'eu', 'A21TJRUUN4KGV', 'SELLER-A', 'Amazon India A', 'active', '10000000-0000-0000-0000-000000000001'),
  ('22222222-2000-0000-0000-000000222222', '22000000-0000-0000-0000-000000000022', 'amazon', 'eu', 'A21TJRUUN4KGV', 'SELLER-B', 'Amazon India B', 'active', '20000000-0000-0000-0000-000000000002');

insert into public.advertising_performance_daily (
  workspace_id, marketplace_account_id, campaign_id, campaign_name, performance_date, spend, attributed_sales
) values
  ('11000000-0000-0000-0000-000000000011', '11111111-1000-0000-0000-000000111111', 'CAMPAIGN-A', 'Tenant A Campaign', current_date, 10, 50),
  ('22000000-0000-0000-0000-000000000022', '22222222-2000-0000-0000-000000222222', 'CAMPAIGN-B', 'Tenant B Campaign', current_date, 20, 100);

insert into public.expenses (
  id, workspace_id, user_id, category, amount, currency, date
) values
  ('11111111-1100-0000-0000-000000111111', '11000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', 'Software', 100, 'INR', current_date),
  ('22222222-2200-0000-0000-000000222222', '22000000-0000-0000-0000-000000000022', '20000000-0000-0000-0000-000000000002', 'Software', 200, 'INR', current_date);

insert into public.goals (
  id, workspace_id, user_id, name, target_amount, current_savings, priority, color, category
) values
  ('11111111-1110-0000-0000-000000111111', '11000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', 'Tenant A Goal', 1000, 100, 'medium', 'indigo', 'other'),
  ('22222222-2220-0000-0000-000000222222', '22000000-0000-0000-0000-000000000022', '20000000-0000-0000-0000-000000000002', 'Tenant B Goal', 2000, 200, 'medium', 'indigo', 'other');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select is(
  (select count(*)::integer from public.products),
  1,
  'Tenant A sees only its product rows'
);
select is(
  (select count(*)::integer from public.jobs),
  1,
  'Tenant A sees only its job rows'
);
select is(
  (select count(*)::integer from public.ai_memories),
  1,
  'Tenant A sees only its AI memory rows'
);
select is(
  (select count(*)::integer from public.workspace_members),
  1,
  'Tenant A cannot enumerate other workspace memberships'
);
select is(
  (select count(*)::integer from public.orders),
  1,
  'Tenant A sees only its order rows'
);
select is(
  (select count(*)::integer from public.shipments),
  1,
  'Tenant A sees only its shipment rows'
);
select is(
  (select count(*)::integer from public.reyo_pack_sessions),
  1,
  'Tenant A sees only its Reyo Pack sessions'
);
select is(
  (select count(*)::integer from public.reyo_pack_packing_events),
  1,
  'Tenant A sees only its immutable packing events'
);
select is(
  (select count(*)::integer from public.reyo_pack_locations),
  1,
  'Tenant A sees only its warehouse locations'
);
select is(
  (select count(*)::integer from public.workspaces),
  1,
  'Tenant A cannot enumerate other workspaces'
);
select is(
  (select count(*)::integer from public.ai_schedules),
  1,
  'Tenant A sees only its recurring schedules'
);
select is(
  (select count(*)::integer from public.advertising_performance_daily),
  1,
  'Tenant A sees only its daily advertising facts'
);
select is(
  (select count(*)::integer from public.expenses),
  1,
  'Tenant A sees only its expense ledger rows'
);
select is(
  (select count(*)::integer from public.goals),
  1,
  'Tenant A sees only its goal rows'
);

select throws_ok(
  $$
    insert into public.products (workspace_id, user_id, sku, name)
    values (
      '22000000-0000-0000-0000-000000000022',
      '10000000-0000-0000-0000-000000000001',
      'CROSS-TENANT-SKU',
      'Blocked Product'
    )
  $$,
  '42501',
  null,
  'Tenant A cannot insert into Tenant B'
);
select throws_ok(
  $$
    insert into public.orders (workspace_id, user_id, channel, channel_order_id, status, total_amount, currency)
    values (
      '22000000-0000-0000-0000-000000000022',
      '10000000-0000-0000-0000-000000000001',
      'amazon',
      'CROSS-TENANT-ORDER',
      'pending',
      1,
      'INR'
    )
  $$,
  '42501',
  null,
  'Tenant A cannot insert an order into Tenant B'
);
select throws_ok(
  $$
    insert into public.ai_schedules (
      workspace_id, user_id, title, task_type, cron_schedule, status, next_run
    ) values (
      '22000000-0000-0000-0000-000000000022',
      '10000000-0000-0000-0000-000000000001',
      'Cross Tenant Schedule',
      'check_inventory',
      '0 * * * *',
      'active',
      now() + interval '1 hour'
    )
  $$,
  '42501',
  null,
  'Tenant A cannot create a schedule in Tenant B'
);
select throws_ok(
  $$
    insert into public.advertising_performance_daily (
      workspace_id, marketplace_account_id, campaign_id, campaign_name, performance_date
    ) values (
      '22000000-0000-0000-0000-000000000022',
      '22222222-2000-0000-0000-000000222222',
      'CROSS-TENANT-CAMPAIGN',
      'Blocked Campaign',
      current_date
    )
  $$,
  '42501',
  null,
  'Tenant A cannot insert daily advertising facts directly'
);
select throws_ok(
  $$
    insert into public.expenses (
      workspace_id, user_id, category, amount, currency, date
    ) values (
      '22000000-0000-0000-0000-000000000022',
      '10000000-0000-0000-0000-000000000001',
      'Software',
      1,
      'INR',
      current_date
    )
  $$,
  '42501',
  null,
  'Tenant A cannot insert expenses directly into Tenant B'
);
select throws_ok(
  $$
    insert into public.goals (
      workspace_id, user_id, name, target_amount, current_savings, priority, color, category
    ) values (
      '22000000-0000-0000-0000-000000000022',
      '10000000-0000-0000-0000-000000000001',
      'Cross Tenant Goal',
      1,
      0,
      'medium',
      'indigo',
      'other'
    )
  $$,
  '42501',
  null,
  'Tenant A cannot insert goals directly into Tenant B'
);
select throws_ok(
  $$
    insert into public.reyo_pack_packing_events (
      workspace_id, event_type, quantity
    ) values (
      '22000000-0000-0000-0000-000000000022',
      'ERROR',
      0
    )
  $$,
  '42501',
  null,
  'Authenticated clients cannot write Reyo Pack events directly'
);
select throws_ok(
  $$ select count(*) from public.reyo_pack_label_documents $$,
  '42501',
  null,
  'Sensitive label document references remain service-only'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.get_reyo_pack_queue_page(uuid,text,text,text,boolean,integer,integer)',
    'EXECUTE'
  ),
  false,
  'Authenticated clients cannot bypass the authorized Reyo Pack queue API'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.get_reyo_pack_history_page(uuid,text,text,timestamptz,timestamptz,integer,integer)',
    'EXECUTE'
  ),
  false,
  'Authenticated clients cannot bypass the authorized Reyo Pack history API'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.lookup_reyo_putaway_product(uuid,uuid,uuid,text)',
    'EXECUTE'
  ),
  false,
  'Authenticated clients cannot bypass the authorized putaway lookup API'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.confirm_reyo_putaway_sku(uuid,uuid,uuid,uuid,uuid,bigint,integer,text,text)',
    'EXECUTE'
  ),
  false,
  'Authenticated clients cannot bypass the atomic putaway confirmation API'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.save_reyo_pack_settings(uuid,uuid,bigint,boolean,boolean,numeric,integer,integer,integer,boolean)',
    'EXECUTE'
  ),
  false,
  'Authenticated clients cannot bypass Reyo Pack admin settings authorization'
);

select is(
  (select private.is_workspace_member('11000000-0000-0000-0000-000000000011')),
  true,
  'Membership helper accepts Tenant A workspace'
);
select is(
  (select private.is_workspace_member('22000000-0000-0000-0000-000000000022')),
  false,
  'Membership helper rejects Tenant B workspace'
);

select * from finish();
rollback;
