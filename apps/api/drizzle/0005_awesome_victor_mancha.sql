ALTER TABLE "lastfm_tokens" ADD COLUMN "session_key" text NOT NULL;--> statement-breakpoint
ALTER TABLE "lastfm_tokens" ADD COLUMN "user" text NOT NULL;--> statement-breakpoint
ALTER TABLE "lastfm_tokens" DROP COLUMN "token";