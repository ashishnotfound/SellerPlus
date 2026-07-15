import { createClient } from "@supabase/supabase-js";

const getSupabaseUrl = () => {
  if (typeof window !== "undefined" && (window as any).__SUPABASE_CONFIG__?.url) {
    return (window as any).__SUPABASE_CONFIG__.url;
  }
  return process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder-url.supabase.co";
};

const getSupabaseAnonKey = () => {
  if (typeof window !== "undefined" && (window as any).__SUPABASE_CONFIG__?.anonKey) {
    return (window as any).__SUPABASE_CONFIG__.anonKey;
  }
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";
};

let _supabaseClient: any = null;

export const getSupabase = () => {
  if (!_supabaseClient) {
    _supabaseClient = createClient(getSupabaseUrl(), getSupabaseAnonKey());
  }
  return _supabaseClient;
};

// For backwards compatibility, proxy the supabase export if it's imported statically
export const supabase = new Proxy({} as any, {
  get: (target, prop) => {
    return getSupabase()[prop as keyof typeof _supabaseClient];
  }
});


export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: 'owner' | 'admin' | 'manager' | 'analyst' | 'employee' | 'read-only';
  updated_at: string;
  created_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete';
  plan_type: 'free' | 'weekly' | 'pro' | 'business';
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  razorpay_subscription_id: string | null;
}
