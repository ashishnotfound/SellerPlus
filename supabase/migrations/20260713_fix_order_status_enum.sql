-- SellerPlus OS — Fix order status enum constraint
-- The original schema only allowed: 'pending', 'packed', 'shipped', 'delivered', 'returned', 'cancelled'
-- Amazon SP-API returns statuses that need to be mapped. The new internal enum supports:
-- 'pending', 'processing', 'shipped', 'delivered', 'returned', 'cancelled', 'unfulfillable'

-- 1. Drop the old constraint
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;

-- 2. Add the expanded constraint with all valid internal statuses
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check 
  CHECK (status IN ('pending', 'processing', 'shipped', 'delivered', 'returned', 'cancelled', 'unfulfillable'));

-- 3. Migrate any existing rows with old statuses
UPDATE public.orders SET status = 'processing' WHERE status = 'packed';
UPDATE public.orders SET status = 'processing' WHERE status = 'Unshipped';
UPDATE public.orders SET status = 'processing' WHERE status = 'PartiallyShipped';
UPDATE public.orders SET status = 'shipped' WHERE status = 'Shipped';
UPDATE public.orders SET status = 'cancelled' WHERE status IN ('Canceled', 'Cancelled');
UPDATE public.orders SET status = 'pending' WHERE status IN ('Pending', 'PendingAvailability', 'InvoiceUnconfirmed');
UPDATE public.orders SET status = 'unfulfillable' WHERE status = 'Unfulfillable';
