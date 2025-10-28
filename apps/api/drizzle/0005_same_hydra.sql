ALTER TABLE "spotify_accounts" ALTER COLUMN "spotify_app_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "spotify_apps" ADD COLUMN "spotify_secret" text NOT NULL;