-- 20260714_ai_memory_and_goals.sql
-- Creates the recommendation history table for AI Memory and feedback loops.

CREATE TYPE recommendation_status AS ENUM ('pending', 'accepted', 'rejected', 'ignored', 'auto_executed');

CREATE TABLE public.ai_recommendation_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    recommendation TEXT NOT NULL,
    confidence_score INTEGER NOT NULL,
    evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
    formula TEXT,
    source_tables JSONB NOT NULL DEFAULT '[]'::jsonb,
    ai_reasoning TEXT NOT NULL,
    action_mapping JSONB NOT NULL,
    is_deterministic BOOLEAN NOT NULL DEFAULT false,
    status recommendation_status NOT NULL DEFAULT 'pending',
    context_goal VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    resolved_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.ai_recommendation_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own AI recommendations" 
    ON public.ai_recommendation_history 
    FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own AI recommendations" 
    ON public.ai_recommendation_history 
    FOR UPDATE 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own AI recommendations" 
    ON public.ai_recommendation_history 
    FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can manage all AI recommendations" 
    ON public.ai_recommendation_history 
    USING (true)
    WITH CHECK (true);
