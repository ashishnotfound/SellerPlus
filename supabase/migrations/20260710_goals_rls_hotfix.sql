-- Migration: Goals & Milestones anonymous/local sandbox testing RLS policies
-- Fixes Supabase 401 / 400 errors for /rest/v1/goals and /rest/v1/milestones in local development

-- 1. Enable RLS on goals (precautionary)
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

-- 2. Add anonymous testing policy for goals
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='goals' AND policyname='Allow anonymous local testing for goals'
  ) THEN
    CREATE POLICY "Allow anonymous local testing for goals" 
      ON public.goals 
      FOR ALL USING (auth.role() = 'anon') WITH CHECK (auth.role() = 'anon');
  END IF;
END $$;

-- 3. Enable RLS on milestones (precautionary)
ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;

-- 4. Add anonymous testing policy for milestones
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='milestones' AND policyname='Allow anonymous local testing for milestones'
  ) THEN
    CREATE POLICY "Allow anonymous local testing for milestones" 
      ON public.milestones 
      FOR ALL USING (auth.role() = 'anon') WITH CHECK (auth.role() = 'anon');
  END IF;
END $$;
