import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import { useToastStore } from "@/hooks/use-toast-store";

export interface UserSession {
  id: string;
  email: string;
  fullName: string;
  role: string;
  avatarUrl?: string;
  isAuthenticated: boolean;
  isSuperAdmin: boolean;
  isSuspended: boolean;
  impersonatingUserId?: string;
}

interface AuthStore {
  user: UserSession | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<boolean>;
  signup: (email: string, pass: string, name: string) => Promise<boolean>;
  logout: () => void;
  checkSession: () => void;
  impersonateUser: (targetUser: { id: string; email: string; fullName: string }) => void;
  stopImpersonation: () => void;
}

export const useAuth = create<AuthStore>((set) => ({
  user: null,
  loading: true,

  login: async (email, pass) => {
    set({ loading: true });
    try {
      const isPlaceholderKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === "placeholder-anon-key";
      if (!isPlaceholderKey) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
        if (!error && data.user) {
          // Fetch profile updates
          const { data: profile } = await supabase
            .from("profiles")
            .select("is_super_admin, is_suspended, role")
            .eq("id", data.user.id)
            .maybeSingle();

          const uSession: UserSession = {
            id: data.user.id,
            email: data.user.email || email,
            fullName: data.user.user_metadata?.full_name || "Merchant Owner",
            role: profile?.role || "owner",
            isSuperAdmin: profile?.is_super_admin || false,
            isSuspended: profile?.is_suspended || false,
            isAuthenticated: true,
          };
          set({ user: uSession, loading: false });
          return true;
        } else if (error) {
          useToastStore.getState().error("Login Failed", error.message);
          set({ loading: false });
          return false;
        }
      }
    } catch (e) {
      console.warn("Supabase Auth sign in failed", e);
    }

    // Local sandbox dev fallback — only reached if Supabase key is placeholder
    const isPlaceholderKeyFallback = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === "placeholder-anon-key";
    if (!isPlaceholderKeyFallback) {
      set({ loading: false });
      return false;
    }
    const isMockAdmin = email.includes("admin") || email.includes("owner");
    const uSession: UserSession = {
      id: "00000000-0000-4000-8000-" + String(Date.now()).slice(-12),
      email: email,
      fullName: email.split("@")[0].toUpperCase() + " Stores",
      role: "owner",
      isSuperAdmin: isMockAdmin,
      isSuspended: false,
      isAuthenticated: true,
    };
    set({ user: uSession, loading: false });
    return true;
  },

  signup: async (email, pass, name) => {
    set({ loading: true });
    try {
      const isPlaceholderKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === "placeholder-anon-key";
      if (!isPlaceholderKey) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: pass,
          options: { data: { full_name: name } },
        });
        if (!error && data.user) {
          const uSession: UserSession = {
            id: data.user.id,
            email: data.user.email || email,
            fullName: name,
            role: "owner",
            isSuperAdmin: false,
            isSuspended: false,
            isAuthenticated: true,
          };
          set({ user: uSession, loading: false });
          return true;
        } else if (error) {
          useToastStore.getState().error("Sign Up Failed", error.message);
          set({ loading: false });
          return false;
        }
      }
    } catch (e) {
      console.warn("Supabase signup failed", e);
    }

    // Sandbox dev fallback only when using placeholder keys
    const isPlaceholderKeyFallbackSignup = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === "placeholder-anon-key";
    if (!isPlaceholderKeyFallbackSignup) {
      set({ loading: false });
      return false;
    }
    const uSession: UserSession = {
      id: "00000000-0000-4000-8000-" + String(Date.now()).slice(-12),
      email: email,
      fullName: name,
      role: "owner",
      isSuperAdmin: false,
      isSuspended: false,
      isAuthenticated: true,
    };
    set({ user: uSession, loading: false });
    return true;
  },

  logout: () => {
    localStorage.removeItem("sp_real_admin");
    try {
      supabase.auth.signOut();
    } catch (_) {}
    set({ user: null, loading: false });
  },

  checkSession: async () => {
    set({ loading: true });
    if (typeof window !== "undefined") {
      // 1. First, let the Supabase client restore its own JWT session.
      //    This is critical so RLS policies (auth.uid()) work on direct table calls.
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session?.user) {
          const sbUser = sessionData.session.user;
          // Fetch full profile to get role and admin status
          const { data: profile } = await supabase
            .from("profiles")
            .select("role, is_super_admin, is_suspended")
            .eq("id", sbUser.id)
            .maybeSingle();

          const uSession: UserSession = {
            id: sbUser.id,
            email: sbUser.email || "",
            fullName: sbUser.user_metadata?.full_name || "Merchant Owner",
            role: profile?.role || "owner",
            isSuperAdmin: profile?.is_super_admin || false,
            isSuspended: profile?.is_suspended || false,
            isAuthenticated: true,
          };
          set({ user: uSession, loading: false });
          return;
        }
      } catch (e) {
        console.warn("[useAuth] Supabase getSession failed, falling back to localStorage:", e);
      }

      set({ user: null, loading: false });
    }
  },

  impersonateUser: (targetUser) => {
    set((state) => {
      if (!state.user) return {};
      // Backup the real admin session
      const originalAdmin = { ...state.user };
      localStorage.setItem("sp_real_admin", JSON.stringify(originalAdmin));
      
      const impersonatedSession: UserSession = {
        ...state.user,
        id: targetUser.id,
        email: targetUser.email,
        fullName: targetUser.fullName,
        role: "Impersonated",
        impersonatingUserId: targetUser.id,
        isSuperAdmin: false // Don't carry admin privileges to the impersonated context
      };
      
      return { user: impersonatedSession };
    });
  },

  stopImpersonation: () => {
    set((state) => {
      const storedAdmin = localStorage.getItem("sp_real_admin");
      if (storedAdmin) {
        const originalAdmin = JSON.parse(storedAdmin) as UserSession;
        localStorage.removeItem("sp_real_admin");
        return { user: originalAdmin };
      }
      return {};
    });
  }
}));
