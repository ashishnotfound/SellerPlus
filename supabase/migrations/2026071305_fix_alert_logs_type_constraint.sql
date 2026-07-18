-- SellerPlus OS — Fix alert_logs type constraint
-- Drop the restricted check constraint on alert_logs.type to prevent inserts from crashing.
-- The original table allowed: 'low_stock', 'sales_drop', 'high_refunds', 'profit_decrease', 'out_of_stock_risk'
-- The new profit leak detector inserts: 'high_acos', 'dead_inventory', 'negative_margin', 'missing_cost_profile', 'stockout_risk'

DO $$
DECLARE
    r RECORD;
BEGIN
    -- Locate any check constraint containing column "type" on "alert_logs" table and drop them
    FOR r IN
        SELECT tc.constraint_name 
        FROM information_schema.table_constraints tc 
        JOIN information_schema.constraint_column_usage ccu 
          ON tc.constraint_name = ccu.constraint_name 
         AND tc.table_schema = ccu.table_schema
        WHERE tc.table_name = 'alert_logs' 
          AND ccu.column_name = 'type'
          AND tc.constraint_type = 'CHECK'
    LOOP
        EXECUTE 'ALTER TABLE public.alert_logs DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name);
    END LOOP;
END $$;

-- Verify or add a new, expanded constraint to keep things safe but matching our types
ALTER TABLE public.alert_logs ADD CONSTRAINT alert_logs_type_check 
  CHECK (type IN (
    'low_stock', 'sales_drop', 'high_refunds', 'profit_decrease', 'out_of_stock_risk',
    'high_acos', 'dead_inventory', 'negative_margin', 'missing_cost_profile', 'stockout_risk'
  ));
