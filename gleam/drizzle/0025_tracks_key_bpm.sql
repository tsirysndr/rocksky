ALTER TABLE "tracks" ADD COLUMN IF NOT EXISTS "key" text;--> statement-breakpoint
ALTER TABLE "tracks" ADD COLUMN IF NOT EXISTS "bpm" real;
