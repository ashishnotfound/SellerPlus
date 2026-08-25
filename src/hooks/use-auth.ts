"use client";

import { create } from "zustand";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { useToastStore } from "@/hooks/use-toast-store";
import { isWorkspaceRole, type WorkspaceRole } from "@/lib/security/permissions";

export interface UserSession {
  id: string;
  email: string;
  fullName: string;
  role: string;
  workspaceId: string;
  workspaceRole: WorkspaceRole;
  avatarUrl?: string;
  isAuthenticated: boolean;
  isSuperAdmin: boolean;
  isSuspended: boolean;
}

interface AuthStore {
  user: UserSession | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<boolean>;
  signup: (email: string, pass: string, name: string) => Promise<boolean>;
  logout: () => Promise<void>;
  checkSession: () => Promise<void>;
}

async function hydrateUser(user: User): Promise<UserSession> {
  const [{ data: profile, error: profileError }, { data: membership, error: membershipError }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, avatar_url, role, is_super_admin, is_suspended")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("workspace_members")
        .select("workspace_id, role")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

  if (profileError) throw new Error("Unable to load your SellerPlus profile.");
  if (membershipError || !membership?.workspace_id) {
    throw new Error("Your SellerPlus workspace is not configured. Contact support.");
  }

  const workspaceRole = isWorkspaceRole(membership.role) ? membership.role : "viewer";

  return {
    id: user.id,
    email: user.email ?? "",
    fullName: profile?.full_name || "Merchant Owner",
    role: profile?.role || workspaceRole,
    workspaceId: membership.workspace_id,
    workspaceRole,
    avatarUrl: profile?.avatar_url ?? undefined,
    isSuperAdmin: profile?.is_super_admin === true,
    isSuspended: profile?.is_suspended === true,
    isAuthenticated: true,
  };
}

export const useAuth = create<AuthStore>((set) => ({
  user: null,
  loading: true,

  login: async (email, pass) => {
    set({ loading: true });
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: pass,
    });

    if (error || !data.user) {
      useToastStore.getState().error("Login failed", error?.message || "Invalid credentials.");
      set({ user: null, loading: false });
      return false;
    }

    try {
      const session = await hydrateUser(data.user);
      if (session.isSuspended) {
        await supabase.auth.signOut();
        throw new Error("This account is suspended.");
      }
      set({ user: session, loading: false });
      return true;
    } catch (error) {
      await supabase.auth.signOut();
      useToastStore.getState().error(
        "Workspace unavailable",
        error instanceof Error ? error.message : "Unable to open the workspace.",
      );
      set({ user: null, loading: false });
      return false;
    }
  },

  signup: async (email, pass, name) => {
    set({ loading: true });
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password: pass,
      options: { data: { full_name: name.trim() } },
    });

    if (error || !data.user) {
      useToastStore.getState().error("Sign up failed", error?.message || "Unable to create account.");
      set({ user: null, loading: false });
      return false;
    }

    if (!data.session) {
      useToastStore.getState().success(
        "Check your email",
        "Verify your email address, then sign in to SellerPlus.",
      );
      set({ user: null, loading: false });
      return false;
    }

    try {
      const session = await hydrateUser(data.user);
      set({ user: session, loading: false });
      return true;
    } catch (error) {
      useToastStore.getState().error(
        "Workspace setup failed",
        error instanceof Error ? error.message : "Unable to create your workspace.",
      );
      set({ user: null, loading: false });
      return false;
    }
  },

  logout: async () => {
    await supabase.auth.signOut({ scope: "local" });
    set({ user: null, loading: false });
  },

  checkSession: async () => {
    set({ loading: true });
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      set({ user: null, loading: false });
      return;
    }

    try {
      const session = await hydrateUser(data.user);
      set({ user: session, loading: false });
    } catch {
      set({ user: null, loading: false });
    }
  },
}));
