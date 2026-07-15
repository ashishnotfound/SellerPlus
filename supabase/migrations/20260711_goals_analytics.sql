-- Migration: Goals analytics tracking columns
-- Adds metric, start_date, and savings_percentage columns to public.goals for automatic progress calculation.

ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS metric TEXT DEFAULT 'savings' CHECK (metric IN ('savings', 'revenue', 'profit', 'orders', 'units_sold', 'listings', 'visitors', 'repeat_customers', 'reviews', 'active_products', 'custom'));
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS start_date DATE DEFAULT CURRENT_DATE NOT NULL;
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS savings_percentage NUMERIC(5, 2) DEFAULT 0 NOT NULL;
