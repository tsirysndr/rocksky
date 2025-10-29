CREATE TABLE "spotify_apps" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id() NOT NULL,
	"xata_version" integer,
	"spotify_app_id" text NOT NULL,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "spotify_accounts" ADD COLUMN "spotify_app_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "spotify_tokens" ADD COLUMN "spotify_app_id" text NOT NULL;