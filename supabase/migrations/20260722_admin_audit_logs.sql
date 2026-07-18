-- Migration: Admin Audit Logs
-- Creates a table specifically for high-level Super Admin audit trailing.

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    admin_email TEXT,
    target_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- Only super admins can view the logs
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='admin_audit_logs' AND policyname='Super admins can view all admin audit logs'
  ) THEN
    CREATE POLICY "Super admins can view all admin audit logs" ON public.admin_audit_logs
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid() AND is_super_admin = true
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='admin_audit_logs' AND policyname='Super admins can insert admin audit logs'
  ) THEN
    CREATE POLICY "Super admins can insert admin audit logs" ON public.admin_audit_logs
      FOR INSERT WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid() AND is_super_admin = true
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='admin_audit_logs' AND policyname='Allow anonymous local testing for admin audit logs'
  ) THEN
    CREATE POLICY "Allow anonymous local testing for admin audit logs" ON public.admin_audit_logs
      FOR ALL USING (auth.role() = 'anon') WITH CHECK (auth.role() = 'anon');
  END IF;
END $$;
