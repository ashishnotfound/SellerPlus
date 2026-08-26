-- SellerPlus production hardening
-- Suspended and closed workspaces must not remain readable through membership
-- RLS or usable through security-definer tenant helpers.

begin;

create or replace function private.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members membership
    join public.profiles profile on profile.id = membership.user_id
    join public.workspaces workspace on workspace.id = membership.workspace_id
    where membership.workspace_id = target_workspace_id
      and membership.user_id = (select auth.uid())
      and workspace.status = 'active'
      and coalesce(profile.is_suspended, false) = false
  );
$$;

create or replace function private.workspace_role(target_workspace_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select membership.role
  from public.workspace_members membership
  join public.profiles profile on profile.id = membership.user_id
  join public.workspaces workspace on workspace.id = membership.workspace_id
  where membership.workspace_id = target_workspace_id
    and membership.user_id = (select auth.uid())
    and workspace.status = 'active'
    and coalesce(profile.is_suspended, false) = false
  limit 1;
$$;

revoke all on function private.is_workspace_member(uuid) from public, anon;
revoke all on function private.workspace_role(uuid) from public, anon;
grant execute on function private.is_workspace_member(uuid) to authenticated, service_role;
grant execute on function private.workspace_role(uuid) to authenticated, service_role;

commit;
