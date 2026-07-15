-- Migration: Multi-tenant Workspaces Schema
-- Creates workspaces and workspace_members tables, with RLS policies and triggers.

CREATE TABLE IF NOT EXISTS public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(workspace_id, user_id)
);

-- Enable RLS
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

-- Workspaces RLS Policies
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='workspaces' AND policyname='Users can view workspaces they are members of'
  ) THEN
    CREATE POLICY "Users can view workspaces they are members of" ON public.workspaces
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.workspace_members m 
          WHERE m.workspace_id = id AND m.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='workspaces' AND policyname='Allow anonymous local testing for workspaces'
  ) THEN
    CREATE POLICY "Allow anonymous local testing for workspaces" ON public.workspaces 
      FOR ALL USING (auth.role() = 'anon') WITH CHECK (auth.role() = 'anon');
  END IF;
END $$;

-- Workspace Members RLS Policies
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='workspace_members' AND policyname='Users can view membership of their workspaces'
  ) THEN
    CREATE POLICY "Users can view membership of their workspaces" ON public.workspace_members
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.workspace_members m 
          WHERE m.workspace_id = workspace_id AND m.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='workspace_members' AND policyname='Allow anonymous local testing for workspace_members'
  ) THEN
    CREATE POLICY "Allow anonymous local testing for workspace_members" ON public.workspace_members 
      FOR ALL USING (auth.role() = 'anon') WITH CHECK (auth.role() = 'anon');
  END IF;
END $$;

-- Update trigger for workspaces updated_at
CREATE OR REPLACE TRIGGER on_workspaces_updated
  BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
