-- Migration: Fix workspace_members RLS Infinite Recursion
-- Creates security definer helper to query workspace memberships bypassing recursion

CREATE OR REPLACE FUNCTION public.is_workspace_member(checking_user_id UUID, check_workspace_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = check_workspace_id AND user_id = checking_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop recursive policies
DROP POLICY IF EXISTS "Users can view workspaces they are members of" ON public.workspaces;
DROP POLICY IF EXISTS "Users can view membership of their workspaces" ON public.workspace_members;

-- Recreate with helper function
CREATE POLICY "Users can view workspaces they are members of" ON public.workspaces
  FOR SELECT USING (public.is_workspace_member(auth.uid(), id));

CREATE POLICY "Users can view membership of their workspaces" ON public.workspace_members
  FOR SELECT USING (user_id = auth.uid() OR public.is_workspace_member(auth.uid(), workspace_id));
