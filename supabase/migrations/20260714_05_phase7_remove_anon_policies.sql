-- Phase 7: Production Security — Remove Anonymous RLS Policies
-- These policies were added for local development and MUST NOT exist in production.
-- They allow unauthenticated users to read/write sensitive business data.

-- Drop anonymous testing policies from advertising_campaigns
DROP POLICY IF EXISTS "Allow anonymous local testing for campaigns" ON public.advertising_campaigns;

-- Drop anonymous testing policies from refunds
DROP POLICY IF EXISTS "Allow anonymous local testing for refunds" ON public.refunds;

-- Drop anonymous testing policies from listing_alerts
DROP POLICY IF EXISTS "Allow anonymous local testing for listing alerts" ON public.listing_alerts;

-- Drop anonymous testing policies from llm_settings (contains API keys)
DROP POLICY IF EXISTS "Allow anonymous local testing for LLM settings" ON public.llm_settings;

-- Verify no other anonymous policies exist on sensitive tables
-- (Run this manually to audit): 
-- SELECT schemaname, tablename, policyname, qual 
-- FROM pg_policies 
-- WHERE qual LIKE '%anon%' AND schemaname = 'public';

NOTIFY pgrst, 'reload schema';
