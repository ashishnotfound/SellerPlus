-- Migration: Add listing_id foreign key relation to order_items
-- Links order items to listings for relational joins and detailed product metadata mapping.

ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS listing_id UUID REFERENCES public.listings(id) ON DELETE SET NULL;
