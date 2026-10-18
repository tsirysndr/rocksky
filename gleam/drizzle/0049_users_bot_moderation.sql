-- These fields already exist in the schema snapshots, but older SQL migrations
-- did not create them. Preserve existing moderation flags on upgraded databases.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "is_bot" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "bot_flagged_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "bot_reason" text;
