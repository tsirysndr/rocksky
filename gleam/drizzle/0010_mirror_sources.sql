CREATE TABLE "mirror_sources" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id() NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"external_username" text,
	"encrypted_api_key" text,
	"last_polled_at" timestamp,
	"last_scrobble_seen_at" timestamp,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL,
	"xata_version" integer
);
--> statement-breakpoint
ALTER TABLE "mirror_sources" ADD CONSTRAINT "mirror_sources_user_id_users_xata_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("xata_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "mirror_sources_user_provider_idx" ON "mirror_sources" USING btree ("user_id","provider");
--> statement-breakpoint
CREATE INDEX "mirror_sources_enabled_provider_idx" ON "mirror_sources" USING btree ("enabled","provider");
