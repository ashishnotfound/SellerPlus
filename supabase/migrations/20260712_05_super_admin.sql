-- Migration: Super Admin & Suspension Schema
-- Adds is_super_admin and is_suspended flags to profiles with RLS policies bypassing recursion

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT false NOT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT false NOT NULL;

-- Definer function to check super-admin status bypassing RLS recursion
CREATE OR REPLACE FUNCTION public.is_super_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = user_id AND is_super_admin = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Profiles RLS policies for Super Admin
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='profiles' AND policyname='Super-admins can select all profiles'
  ) THEN
    CREATE POLICY "Super-admins can select all profiles" ON public.profiles
      FOR SELECT USING (public.is_super_admin(auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='profiles' AND policyname='Super-admins can update all profiles'
  ) THEN
    CREATE POLICY "Super-admins can update all profiles" ON public.profiles
      FOR UPDATE USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
  END IF;
END $$;

-- Workspaces RLS policies for Super Admin
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='workspaces' AND policyname='Super-admins can select all workspaces'
  ) THEN
    CREATE POLICY "Super-admins can select all workspaces" ON public.workspaces
      FOR SELECT USING (public.is_super_admin(auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='workspaces' AND policyname='Super-admins can update all workspaces'
  ) THEN
    CREATE POLICY "Super-admins can update all workspaces" ON public.workspaces
      FOR UPDATE USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
  END IF;
END $$;

-- Workspace Members RLS policies for Super Admin
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='workspace_members' AND policyname='Super-admins can select all workspace members'
  ) THEN
    CREATE POLICY "Super-admins can select all workspace members" ON public.workspace_members
      FOR SELECT USING (public.is_super_admin(auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='workspace_members' AND policyname='Super-admins can update all workspace members'
  ) THEN
    CREATE POLICY "Super-admins can update all workspace members" ON public.workspace_members
      FOR ALL USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
  END IF;
END $$;

-- Subscriptions RLS policies for Super Admin
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='subscriptions' AND policyname='Super-admins can select all subscriptions'
  ) THEN
    CREATE POLICY "Super-admins can select all subscriptions" ON public.subscriptions
      FOR SELECT USING (public.is_super_admin(auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='subscriptions' AND policyname='Super-admins can update all subscriptions'
  ) THEN
    CREATE POLICY "Super-admins can update all subscriptions" ON public.subscriptions
      FOR UPDATE USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
  END IF;
END $$;

-- Seed a default super_admin account for the main profile (Owner session fallback)
UPDATE public.profiles SET is_super_admin = true WHERE email = 'seller@sellerplus.in' OR email = 'owner@sellerplus.in';

NOTIFY pgrst, 'reload schema';
