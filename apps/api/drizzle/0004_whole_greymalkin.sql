CREATE TABLE "feeds" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id() NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"did" text NOT NULL,
	"uri" text NOT NULL,
	"user_id" text NOT NULL,
	"xata_version" integer,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "feeds_did_unique" UNIQUE("did"),
	CONSTRAINT "feeds_uri_unique" UNIQUE("uri")
);
--> statement-breakpoint
ALTER TABLE "feeds" ADD CONSTRAINT "feeds_user_id_users_xata_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("xata_id") ON DELETE no action ON UPDATE no action;