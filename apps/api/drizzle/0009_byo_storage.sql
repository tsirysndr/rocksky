CREATE TABLE "user_storage_providers" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id() NOT NULL,
	"user_id" text NOT NULL,
	"label" text NOT NULL,
	"endpoint" text NOT NULL,
	"region" text DEFAULT 'auto' NOT NULL,
	"bucket" text NOT NULL,
	"access_key" text NOT NULL,
	"secret_key" text NOT NULL,
	"public_url" text,
	"verified_at" timestamp,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL,
	"xata_version" integer
);
--> statement-breakpoint
ALTER TABLE "user_storage_providers" ADD CONSTRAINT "user_storage_providers_user_id_users_xata_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("xata_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "user_storage_providers_user_id_idx" ON "user_storage_providers" USING btree ("user_id");
--> statement-breakpoint
ALTER TABLE "user_uploads" ADD COLUMN "storage_provider_id" text;
--> statement-breakpoint
ALTER TABLE "user_uploads" ADD CONSTRAINT "user_uploads_storage_provider_id_user_storage_providers_xata_id_fk" FOREIGN KEY ("storage_provider_id") REFERENCES "public"."user_storage_providers"("xata_id") ON DELETE no action ON UPDATE no action;
