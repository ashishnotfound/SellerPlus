-- Migration: Production ERP Schema Updates
-- Installs Cost Profiles, Expenses, Raw Materials, Profit/Fee columns on orders, and RLS policies

-- 1. Create Cost Profiles table
CREATE TABLE IF NOT EXISTS public.cost_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  printing_cost NUMERIC(10,2) DEFAULT 0 NOT NULL,
  material_cost NUMERIC(10,2) DEFAULT 0 NOT NULL,
  packaging_cost NUMERIC(10,2) DEFAULT 0 NOT NULL,
  shipping_cost NUMERIC(10,2) DEFAULT 0 NOT NULL,
  labor_cost NUMERIC(10,2) DEFAULT 0 NOT NULL,
  misc_cost NUMERIC(10,2) DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE (user_id, name)
);

-- Enable RLS & Policies for Cost Profiles
ALTER TABLE public.cost_profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cost_profiles' AND policyname='Users own cost profiles') THEN
    CREATE POLICY "Users own cost profiles" ON public.cost_profiles FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cost_profiles' AND policyname='Allow anonymous local testing for cost profiles') THEN
    CREATE POLICY "Allow anonymous local testing for cost profiles" ON public.cost_profiles FOR ALL USING (auth.role() = 'anon') WITH CHECK (auth.role() = 'anon');
  END IF;
END $$;


-- 2. Alter Listings table to link to Cost Profiles
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS cost_profile_id UUID REFERENCES public.cost_profiles(id) ON DELETE SET NULL;


-- 3. Alter Orders table to store fee allocations and profits
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS commission_fees NUMERIC(10,2) DEFAULT 0 NOT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS fba_fees NUMERIC(10,2) DEFAULT 0 NOT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_cost NUMERIC(10,2) DEFAULT 0 NOT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS advertising_cost NUMERIC(10,2) DEFAULT 0 NOT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS gross_profit NUMERIC(10,2) DEFAULT 0 NOT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS net_profit NUMERIC(10,2) DEFAULT 0 NOT NULL;


-- 4. Create Expense Tracking table
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  category TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT DEFAULT 'INR' NOT NULL,
  description TEXT,
  date DATE NOT NULL,
  is_recurring BOOLEAN DEFAULT false NOT NULL,
  recurrence_interval TEXT CHECK (recurrence_interval IN ('daily', 'weekly', 'monthly', 'yearly')),
  receipt_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS & Policies for Expenses
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='expenses' AND policyname='Users own expenses') THEN
    CREATE POLICY "Users own expenses" ON public.expenses FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='expenses' AND policyname='Allow anonymous local testing for expenses') THEN
    CREATE POLICY "Allow anonymous local testing for expenses" ON public.expenses FOR ALL USING (auth.role() = 'anon') WITH CHECK (auth.role() = 'anon');
  END IF;
END $$;


-- 5. Create Raw Materials Inventory table
CREATE TABLE IF NOT EXISTS public.raw_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  current_stock INT DEFAULT 0 NOT NULL,
  minimum_stock INT DEFAULT 10 NOT NULL,
  unit TEXT NOT NULL, -- 'pcs', 'grams', 'meters', 'tubes', etc.
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE (user_id, name)
);

-- Enable RLS & Policies for Raw Materials
ALTER TABLE public.raw_materials ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='raw_materials' AND policyname='Users own raw materials') THEN
    CREATE POLICY "Users own raw materials" ON public.raw_materials FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='raw_materials' AND policyname='Allow anonymous local testing for raw materials') THEN
    CREATE POLICY "Allow anonymous local testing for raw materials" ON public.raw_materials FOR ALL USING (auth.role() = 'anon') WITH CHECK (auth.role() = 'anon');
  END IF;
END $$;


-- 6. Add Anonymous Policy for Returns table
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='returns' AND policyname='Allow anonymous local testing for returns') THEN
    CREATE POLICY "Allow anonymous local testing for returns" ON public.returns FOR ALL USING (auth.role() = 'anon') WITH CHECK (auth.role() = 'anon');
  END IF;
END $$;
