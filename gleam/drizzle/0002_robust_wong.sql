CREATE TABLE "follows" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id() NOT NULL,
	"uri" text NOT NULL,
	"follower_did" text NOT NULL,
	"subject_did" text NOT NULL,
	"xata_version" integer,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "follows_uri_unique" UNIQUE("uri")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "follows_follower_subject_unique" ON "follows" USING btree ("follower_did","subject_did");