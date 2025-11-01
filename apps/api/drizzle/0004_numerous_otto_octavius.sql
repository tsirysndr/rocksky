CREATE TABLE "lastfm_tokens" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id() NOT NULL,
	"xata_version" integer,
	"token" text NOT NULL,
	"user_id" text NOT NULL,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tidal_accounts" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id() NOT NULL,
	"xata_version" integer,
	"tidal_user_id" text NOT NULL,
	"user_id" text NOT NULL,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tidal_tokens" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id() NOT NULL,
	"xata_version" integer,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"user_id" text NOT NULL,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lastfm_tokens" ADD CONSTRAINT "lastfm_tokens_user_id_users_xata_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tidal_accounts" ADD CONSTRAINT "tidal_accounts_user_id_users_xata_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tidal_tokens" ADD CONSTRAINT "tidal_tokens_user_id_users_xata_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("xata_id") ON DELETE no action ON UPDATE no action;