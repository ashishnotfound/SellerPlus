import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder-url.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
