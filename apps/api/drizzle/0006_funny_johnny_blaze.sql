CREATE TABLE "upload_queue_state" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id() NOT NULL,
	"user_id" text NOT NULL,
	"upload_ids" text DEFAULT '[]' NOT NULL,
	"current_index" integer DEFAULT 0 NOT NULL,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL,
	"xata_version" integer,
	CONSTRAINT "upload_queue_state_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "upload_queue_state" ADD CONSTRAINT "upload_queue_state_user_id_users_xata_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("xata_id") ON DELETE no action ON UPDATE no action;