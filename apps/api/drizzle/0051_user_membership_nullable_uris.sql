-- Publication copies catalog URIs, which may be absent until records arrive.
ALTER TABLE "public"."user_artists" ALTER COLUMN "uri" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "public"."user_albums" ALTER COLUMN "uri" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "public"."user_tracks" ALTER COLUMN "uri" DROP NOT NULL;
