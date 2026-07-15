-- Migration: Recalculate Profit Triggers
-- Automates retroactive profit calculations when cost profiles or listings are updated

-- 1. Helper to recalculate profit for a single order
CREATE OR REPLACE FUNCTION public.recalculate_order_profit(target_order_id UUID)
RETURNS VOID AS $$
DECLARE
  order_user_id UUID;
  total_cogs NUMERIC(10,2) := 0;
  row_item RECORD;
  profile_rec RECORD;
  unit_cost NUMERIC(10,2);
  v_gross_profit NUMERIC(10,2);
  v_net_profit NUMERIC(10,2);
BEGIN
  -- Fetch order details
  SELECT user_id, gross_profit INTO order_user_id, v_gross_profit FROM public.orders WHERE id = target_order_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Iterate through items and map costs
  FOR row_item IN 
    SELECT seller_sku, quantity_ordered FROM public.order_items WHERE order_id = target_order_id
  LOOP
    SELECT cp.* INTO profile_rec 
    FROM public.cost_profiles cp
    JOIN public.listings l ON l.cost_profile_id = cp.id
    WHERE l.user_id = order_user_id AND l.sku = row_item.seller_sku;

    IF FOUND THEN
      unit_cost := COALESCE(profile_rec.printing_cost, 0) +
                   COALESCE(profile_rec.material_cost, 0) +
                   COALESCE(profile_rec.packaging_cost, 0) +
                   COALESCE(profile_rec.shipping_cost, 0) +
                   COALESCE(profile_rec.labor_cost, 0) +
                   COALESCE(profile_rec.misc_cost, 0);
      total_cogs := total_cogs + (unit_cost * COALESCE(row_item.quantity_ordered, 1));
    END IF;
  END LOOP;

  -- Deduct total item cogs from gross profit to get net profit
  v_net_profit := COALESCE(v_gross_profit, 0) - total_cogs;
  
  UPDATE public.orders 
  SET net_profit = v_net_profit 
  WHERE id = target_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Trigger on order_items modifications
CREATE OR REPLACE FUNCTION public.on_order_item_modified()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalculate_order_profit(OLD.order_id);
    RETURN OLD;
  ELSE
    PERFORM public.recalculate_order_profit(NEW.order_id);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trig_order_item_modified') THEN
    CREATE TRIGGER trig_order_item_modified
      AFTER INSERT OR UPDATE OR DELETE ON public.order_items
      FOR EACH ROW EXECUTE FUNCTION public.on_order_item_modified();
  END IF;
END $$;

-- 3. Trigger on cost_profiles update
CREATE OR REPLACE FUNCTION public.on_cost_profile_modified()
RETURNS TRIGGER AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT DISTINCT oi.order_id 
    FROM public.order_items oi
    JOIN public.listings l ON l.sku = oi.seller_sku
    WHERE l.cost_profile_id = NEW.id
  LOOP
    PERFORM public.recalculate_order_profit(r.order_id);
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trig_cost_profile_modified') THEN
    CREATE TRIGGER trig_cost_profile_modified
      AFTER UPDATE ON public.cost_profiles
      FOR EACH ROW EXECUTE FUNCTION public.on_cost_profile_modified();
  END IF;
END $$;

-- 4. Trigger on listings updates (when cost profile is linked)
CREATE OR REPLACE FUNCTION public.on_listing_modified()
RETURNS TRIGGER AS $$
DECLARE
  r RECORD;
BEGIN
  IF OLD.cost_profile_id IS DISTINCT FROM NEW.cost_profile_id THEN
    FOR r IN 
      SELECT DISTINCT order_id FROM public.order_items WHERE seller_sku = NEW.sku
    LOOP
      PERFORM public.recalculate_order_profit(r.order_id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trig_listing_modified') THEN
    CREATE TRIGGER trig_listing_modified
      AFTER UPDATE ON public.listings
      FOR EACH ROW EXECUTE FUNCTION public.on_listing_modified();
  END IF;
END $$;

-- 5. Run initial one-time sweep recalculating profits of all existing orders
DO $$
DECLARE
  order_rec RECORD;
BEGIN
  FOR order_rec IN SELECT id FROM public.orders LOOP
    PERFORM public.recalculate_order_profit(order_rec.id);
  END LOOP;
END $$;
