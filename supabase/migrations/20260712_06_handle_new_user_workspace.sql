-- Migration: Auto-workspace trigger on signup
-- Updates handle_new_user trigger function to automatically initialize a default workspace and set membership role.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_workspace_id UUID;
  default_name TEXT;
BEGIN
  -- Determine default name
  default_name := COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1));

  -- 1. Insert Profile
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    default_name,
    'owner'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name);

  -- 2. Insert Workspace
  INSERT INTO public.workspaces (name)
  VALUES (default_name || ' Workspace')
  RETURNING id INTO new_workspace_id;

  -- 3. Insert Workspace Member
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (new_workspace_id, NEW.id, 'owner');

  -- 4. Insert Free Subscription
  INSERT INTO public.subscriptions (user_id, status, plan_type, current_period_start, current_period_end)
  VALUES (
    NEW.id,
    'active',
    'free',
    now(),
    now() + interval '30 days'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
