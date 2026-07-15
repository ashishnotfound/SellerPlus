-- Goals System Migration
-- Created: 2026-07-09

CREATE TABLE IF NOT EXISTS public.goals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  target_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  current_savings NUMERIC(12, 2) NOT NULL DEFAULT 0,
  deadline DATE,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'dream')),
  is_completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  color TEXT DEFAULT 'indigo',
  category TEXT DEFAULT 'purchase',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own goals" ON public.goals FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_goals_user ON public.goals(user_id);

-- Milestone achievements table
CREATE TABLE IF NOT EXISTS public.milestones (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  milestone_key TEXT NOT NULL,
  achieved_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(user_id, milestone_key)
);

ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own milestones" ON public.milestones FOR ALL USING (auth.uid() = user_id);
