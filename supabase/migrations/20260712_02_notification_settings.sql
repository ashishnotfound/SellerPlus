-- Migration: Notification Destinations Schema
-- Creates notification_settings table for user-configured Discord, Telegram, and Email alerts

CREATE TABLE IF NOT EXISTS public.notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  email_destination TEXT,
  discord_webhook_url TEXT,
  telegram_bot_token TEXT,
  telegram_chat_id TEXT,
  enable_low_stock_alerts BOOLEAN DEFAULT true NOT NULL,
  enable_daily_summaries BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE (user_id)
);

-- Enable RLS
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='notification_settings' AND policyname='Users own notification settings'
  ) THEN
    CREATE POLICY "Users own notification settings" ON public.notification_settings 
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='notification_settings' AND policyname='Allow anonymous local testing for notification settings'
  ) THEN
    CREATE POLICY "Allow anonymous local testing for notification settings" ON public.notification_settings 
      FOR ALL USING (auth.role() = 'anon') WITH CHECK (auth.role() = 'anon');
  END IF;
END $$;

-- Update trigger
CREATE OR REPLACE TRIGGER on_notification_settings_updated
  BEFORE UPDATE ON public.notification_settings
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
