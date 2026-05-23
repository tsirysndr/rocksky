CREATE TABLE "import_jobs" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id() NOT NULL,
	"user_id" text,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"total" integer DEFAULT 0,
	"processed" integer DEFAULT 0,
	"failed" integer DEFAULT 0,
	"errors" text,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL,
	"xata_version" integer
);
--> statement-breakpoint
CREATE TABLE "user_uploads" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id() NOT NULL,
	"user_id" text NOT NULL,
	"track_id" text NOT NULL,
	"r2_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size" integer NOT NULL,
	"original_filename" text NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL,
	"xata_version" integer
);
--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_user_id_users_xata_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_uploads" ADD CONSTRAINT "user_uploads_user_id_users_xata_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_uploads" ADD CONSTRAINT "user_uploads_track_id_tracks_xata_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_jobs_user_id_idx" ON "import_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "import_jobs_status_idx" ON "import_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "user_uploads_user_id_idx" ON "user_uploads" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_uploads_track_id_idx" ON "user_uploads" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX "loved_tracks_track_id_idx" ON "loved_tracks" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX "tracks_artist_uri_idx" ON "tracks" USING btree ("artist_uri");