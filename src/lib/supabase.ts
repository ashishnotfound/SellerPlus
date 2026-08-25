import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export const getSupabase = (): SupabaseClient => createClient();

// For backwards compatibility, proxy the supabase export if it's imported statically
export const supabase = new Proxy({} as SupabaseClient, {
  get: (_target, prop) => {
    const client = getSupabase() as unknown as Record<PropertyKey, unknown>;
    const value = client[prop];
    return typeof value === "function" ? value.bind(client) : value;
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
