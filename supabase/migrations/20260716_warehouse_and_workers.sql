-- ===================================================================
-- SellerPlus OS — Phase 9: Warehouse Operations & AI Scheduling
-- Migration: 20260716_warehouse_and_workers.sql
-- ===================================================================

-- ─── 1. Extend profiles role constraint ──────────────────────────────
-- Drop the old constraint and redefine it to include warehouse roles.
-- Existing data (owner, admin, manager, analyst, employee, read-only)
-- continues to be valid — this is purely additive.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_role_check' AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check;
  END IF;
END $$;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'owner', 'admin', 'manager', 'analyst', 'employee', 'read-only',
    'warehouse', 'packer', 'shipping'
  ));

-- ─── 2. Extend orders table ───────────────────────────────────────────
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_method TEXT DEFAULT 'Standard';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS packing_notes TEXT;

-- ─── 3. Extend listings table ─────────────────────────────────────────
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS infographic_concepts TEXT[] DEFAULT '{}'::text[];
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS ai_image_prompts     TEXT[] DEFAULT '{}'::text[];
-- Revision tracking for draft listing versioning
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS draft_revision    INT     DEFAULT 0;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS draft_history     JSONB   DEFAULT '[]'::jsonb;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS published_at      TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS published_by      UUID    REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ─── 4. Warehouse order audit log ────────────────────────────────────
-- Immutable append-only ledger of every order status transition.
-- Never delete rows from this table.
CREATE TABLE IF NOT EXISTS public.warehouse_audit_log (
  id               UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id         UUID         NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id          UUID         NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  previous_status  TEXT         NOT NULL,
  new_status       TEXT         NOT NULL,
  note             TEXT,
  created_at       TIMESTAMPTZ  DEFAULT now() NOT NULL
);

ALTER TABLE public.warehouse_audit_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'warehouse_audit_log'
      AND policyname = 'Users can view their own warehouse audit logs'
  ) THEN
    CREATE POLICY "Users can view their own warehouse audit logs"
      ON public.warehouse_audit_log FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.orders o
          WHERE o.id = order_id AND o.user_id = auth.uid()
        )
      );
  END IF;

  -- Service role writes on behalf of all users via admin client
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'warehouse_audit_log'
      AND policyname = 'Service role manages warehouse audit log'
  ) THEN
    CREATE POLICY "Service role manages warehouse audit log"
      ON public.warehouse_audit_log FOR ALL
      USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_warehouse_audit_order_id  ON public.warehouse_audit_log(order_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_audit_created   ON public.warehouse_audit_log(created_at DESC);

-- ─── 5. AI Schedules — schedule configuration store ──────────────────
-- Stores only the schedule definition. Execution is always via bi_jobs.
CREATE TABLE IF NOT EXISTS public.ai_schedules (
  id             UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID         NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title          TEXT         NOT NULL,
  task_type      TEXT         NOT NULL,  -- matches JobRegistry keys
  cron_schedule  TEXT         NOT NULL,  -- standard 5-field cron: '0 */6 * * *'
  status         TEXT         NOT NULL   DEFAULT 'active'
                              CHECK (status IN ('active', 'paused')),
  last_run       TIMESTAMPTZ,
  next_run       TIMESTAMPTZ  NOT NULL,
  created_at     TIMESTAMPTZ  DEFAULT now() NOT NULL,
  UNIQUE (user_id, task_type)
);

ALTER TABLE public.ai_schedules ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_schedules'
      AND policyname = 'Users own their schedules'
  ) THEN
    CREATE POLICY "Users own their schedules"
      ON public.ai_schedules FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_schedules'
      AND policyname = 'Service role manages schedules'
  ) THEN
    CREATE POLICY "Service role manages schedules"
      ON public.ai_schedules FOR ALL
      USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ai_schedules_next_run
  ON public.ai_schedules(next_run ASC, status)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_ai_schedules_user_id ON public.ai_schedules(user_id);

-- ─── 6. Notify PostgREST to reload schema ────────────────────────────
NOTIFY pgrst, 'reload schema';
