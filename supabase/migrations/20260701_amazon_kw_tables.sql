-- Amazon KW™ Module Tables
-- Created: 2026-07-01

-- Keyword Projects / Folders
CREATE TABLE IF NOT EXISTS keyword_projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT 'emerald',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Keyword Lists (belong to a project)
CREATE TABLE IF NOT EXISTS keyword_lists (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES keyword_projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  keyword_seed TEXT,
  category TEXT,
  marketplace TEXT DEFAULT 'Amazon India',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Saved Keywords (individual keywords saved to a list)
CREATE TABLE IF NOT EXISTS saved_keywords (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  list_id UUID REFERENCES keyword_lists(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  search_volume INTEGER,
  difficulty INTEGER,
  opportunity_score INTEGER,
  cpc NUMERIC(8,2),
  kw_type TEXT,
  intent TEXT,
  trend TEXT,
  notes TEXT,
  is_starred BOOLEAN DEFAULT FALSE,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Keyword Research History (auto-saved searches)
CREATE TABLE IF NOT EXISTS keyword_search_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  marketplace TEXT DEFAULT 'Amazon India',
  category TEXT,
  volume INTEGER,
  difficulty INTEGER,
  opportunity_score INTEGER,
  searched_at TIMESTAMPTZ DEFAULT now()
);

-- RLS Policies
ALTER TABLE keyword_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE keyword_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE keyword_search_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own keyword_projects" ON keyword_projects FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own keyword_lists" ON keyword_lists FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own saved_keywords" ON saved_keywords FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own keyword_search_history" ON keyword_search_history FOR ALL USING (auth.uid() = user_id);
