-- ===================================================================
-- SellerPlus OS — Phase 9.5: P1 Performance Indexes
-- Migration: 20260717_p1_indexes.sql
-- ===================================================================
-- Confirmed missing from 20260714_phase7_db_indexes.sql:
--   1. order_items(seller_sku) — analytics joins, product performance queries
--   2. orders(user_id, status) — status-count aggregations in BIRepository
--
-- All are safe additive-only changes using CREATE INDEX IF NOT EXISTS.
-- ===================================================================

-- 1. order_items: product-level analytics joins on seller_sku
--    Used by BIRepository SKU-level aggregations and ProfitLeakDetector
CREATE INDEX IF NOT EXISTS idx_order_items_seller_sku
  ON public.order_items(seller_sku);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id
  ON public.order_items(order_id);

-- 2. orders: status-count aggregations (Pending/Packed/Shipped dashboard KPIs)
--    Used by warehouse portal and order page counts
CREATE INDEX IF NOT EXISTS idx_orders_user_status
  ON public.orders(user_id, status);

-- 3. bi_jobs: queue drain queries — status + created_at polling on every worker tick
--    Used by bi-processor on every cron tick
CREATE INDEX IF NOT EXISTS idx_bi_jobs_status_created
  ON public.bi_jobs(status, created_at ASC);

-- 4. ai_schedules: next-due schedule polling in task-scheduler
--    Used by task-scheduler cron worker
CREATE INDEX IF NOT EXISTS idx_ai_schedules_user_enabled_next
  ON public.ai_schedules(user_id, status, next_run ASC);

NOTIFY pgrst, 'reload schema';
