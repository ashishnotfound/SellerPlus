-- Prelude: Ensure super-admin columns and helper exist before other migrations
-- This migration is intentionally ordered to run before other 20260712_* files.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT false NOT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT false NOT NULL;

-- Create or replace a SECURITY DEFINER helper so policies can reference it safely
CREATE OR REPLACE FUNCTION public.is_super_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = user_id AND is_super_admin = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- No policies here; the main super_admin migration still creates profile/workspace policies.

NOTIFY pgrst, 'reload schema';
