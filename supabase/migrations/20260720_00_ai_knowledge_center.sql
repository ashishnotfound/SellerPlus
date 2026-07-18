-- Migration for AI Knowledge Center and versioning
-- Matches Master Constitution §3.7 and §3.8

CREATE TABLE public.ai_knowledge_center (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    evidence TEXT[] DEFAULT '{}',
    confidence NUMERIC(5,2) NOT NULL DEFAULT 50.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_verified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    related_products TEXT[] DEFAULT '{}',
    related_marketplace TEXT,
    supporting_metrics JSONB DEFAULT '{}'::JSONB,
    version INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'Verified' CHECK (status IN ('Verified', 'Deprecated', 'Under Review'))
);

CREATE INDEX idx_ai_knowledge_center_user_id ON public.ai_knowledge_center(user_id);
CREATE INDEX idx_ai_knowledge_center_status ON public.ai_knowledge_center(status);

-- RLS
ALTER TABLE public.ai_knowledge_center ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own knowledge center"
    ON public.ai_knowledge_center FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own knowledge center"
    ON public.ai_knowledge_center FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own knowledge center"
    ON public.ai_knowledge_center FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own knowledge center"
    ON public.ai_knowledge_center FOR DELETE
    USING (auth.uid() = user_id);
