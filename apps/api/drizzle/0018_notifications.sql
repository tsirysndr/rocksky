CREATE TABLE IF NOT EXISTS "notifications" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id() NOT NULL,
	"user_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"type" text NOT NULL,
	"shout_id" text,
	"subject_uri" text,
	"read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"xata_createdat" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_xata_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("xata_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_users_xata_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("xata_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "notifications" ADD CONSTRAINT "notifications_shout_id_shouts_xata_id_fk" FOREIGN KEY ("shout_id") REFERENCES "public"."shouts"("xata_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_user_id_read_idx" ON "notifications" USING btree ("user_id","read");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_user_id_createdat_idx" ON "notifications" USING btree ("user_id","xata_createdat");
