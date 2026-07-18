-- Migration: Orders production schema updates
-- Adds unique constraint on orders table and creates order_items table

-- 1. Add unique constraint to prevent duplicate order imports
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_unique_channel_order'
  ) THEN
    ALTER TABLE public.orders
    ADD CONSTRAINT orders_unique_channel_order UNIQUE (user_id, channel, channel_order_id);
  END IF;
END $$;

-- 2. Add Amazon-specific columns to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS purchase_date TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS last_update_date TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS fulfillment_channel TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS marketplace_id TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS number_of_items_shipped INT DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS number_of_items_unshipped INT DEFAULT 0;

-- 3. Relax the status check constraint to accept Amazon's native statuses
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check 
  CHECK (status IN ('pending', 'packed', 'shipped', 'delivered', 'returned', 'cancelled', 'Pending', 'Unshipped', 'PartiallyShipped', 'Shipped', 'Canceled', 'Unfulfillable', 'InvoiceUnconfirmed', 'PendingAvailability'));

-- 4. Create order_items table
CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  amazon_order_item_id TEXT,
  seller_sku TEXT,
  asin TEXT,
  title TEXT,
  quantity_ordered INT DEFAULT 0,
  quantity_shipped INT DEFAULT 0,
  item_price NUMERIC(10, 2) DEFAULT 0,
  item_price_currency TEXT DEFAULT 'INR',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 5a. Add amazon_order_item_id column if not present (idempotent)
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS amazon_order_item_id TEXT;

-- 5b. Add unique constraint on order_items to prevent duplicates
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_items_unique_item'
  ) THEN
    ALTER TABLE public.order_items
    ADD CONSTRAINT order_items_unique_item UNIQUE (order_id, amazon_order_item_id);
  END IF;
END $$;

-- 6. Enable RLS on order_items
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='order_items' AND policyname='Users can view order items'
  ) THEN
    CREATE POLICY "Users can view order items" ON public.order_items FOR ALL USING (
      EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = auth.uid())
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='order_items' AND policyname='Allow anonymous local testing for order items'
  ) THEN
    CREATE POLICY "Allow anonymous local testing for order items" ON public.order_items FOR ALL USING (
      auth.role() = 'anon'
    );
  END IF;
END $$;

-- 7. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_orders_user_channel ON public.orders(user_id, channel);
CREATE INDEX IF NOT EXISTS idx_orders_purchase_date ON public.orders(purchase_date);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_seller_sku ON public.order_items(seller_sku);
