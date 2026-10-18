-- A profile may have no display name. Preserve NULL instead of inventing a name.
ALTER TABLE "public"."users" ALTER COLUMN "display_name" DROP NOT NULL;
