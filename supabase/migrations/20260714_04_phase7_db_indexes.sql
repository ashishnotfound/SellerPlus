-- Phase 7: Production Performance — Missing Database Indexes
-- Adds compound indexes on high-cardinality filter columns.
-- These cover the most frequently executed queries in BIRepository,
-- AutomationEngine, and the Realtime recommendation feed.

-- 1. advertising_campaigns: BI aggregation + automation rule evaluation
CREATE INDEX IF NOT EXISTS idx_adcampaigns_user_status 
  ON public.advertising_campaigns(user_id, status);

CREATE INDEX IF NOT EXISTS idx_adcampaigns_user_updated
  ON public.advertising_campaigns(user_id, updated_at DESC);

-- 2. orders: BIRepository 30-day window query
CREATE INDEX IF NOT EXISTS idx_orders_user_purchase_date
  ON public.orders(user_id, purchase_date DESC);

-- 3. ai_recommendation_history: Realtime hook + recommendation center
CREATE INDEX IF NOT EXISTS idx_ai_rec_history_user_created
  ON public.ai_recommendation_history(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_rec_history_lifecycle
  ON public.ai_recommendation_history(user_id, lifecycle);

-- 4. automation_logs: Recommendation center timeline queries
CREATE INDEX IF NOT EXISTS idx_automation_logs_user_created
  ON public.automation_logs(user_id, created_at DESC);

-- 5. alert_logs: Automation rule idempotency checks (used in restock rule)
CREATE INDEX IF NOT EXISTS idx_alert_logs_user_type_read
  ON public.alert_logs(user_id, type, is_read);

-- 6. ai_response_cache: TTL-based expiry pruning 
-- (Already created in 20260713, adding composite to improve lookup)
CREATE INDEX IF NOT EXISTS idx_ai_response_cache_key_expires
  ON public.ai_response_cache(cache_key, expires_at);

-- 7. feature_flags: Per-key lookups (called multiple times per request)
CREATE INDEX IF NOT EXISTS idx_feature_flags_key
  ON public.feature_flags(key);

CREATE INDEX IF NOT EXISTS idx_feature_flag_overrides_flag_user
  ON public.feature_flag_overrides(flag_key, user_id);

-- 8. listings: Automation rule cost profile scan
CREATE INDEX IF NOT EXISTS idx_listings_user_cost_profile
  ON public.listings(user_id, cost_profile_id);

NOTIFY pgrst, 'reload schema';
