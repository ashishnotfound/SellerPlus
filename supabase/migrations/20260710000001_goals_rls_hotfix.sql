-- Migration: Goals & Milestones anonymous/local sandbox testing RLS policies
-- Fixes Supabase 401 / 400 errors for /rest/v1/goals and /rest/v1/milestones in local development

-- 1. Enable RLS on goals (precautionary)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='goals') THEN
    ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- 2. Add anonymous testing policy for goals
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='goals') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='goals' AND policyname='Allow anonymous local testing for goals'
    ) THEN
      CREATE POLICY "Allow anonymous local testing for goals" 
        ON public.goals 
        FOR ALL USING (auth.role() = 'anon') WITH CHECK (auth.role() = 'anon');
    END IF;
  END IF;
END $$;

-- 3. Enable RLS on milestones (precautionary)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='milestones') THEN
    ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- 4. Add anonymous testing policy for milestones
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='milestones') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='milestones' AND policyname='Allow anonymous local testing for milestones'
    ) THEN
      CREATE POLICY "Allow anonymous local testing for milestones" 
        ON public.milestones 
        FOR ALL USING (auth.role() = 'anon') WITH CHECK (auth.role() = 'anon');
    END IF;
  END IF;
END $$;
