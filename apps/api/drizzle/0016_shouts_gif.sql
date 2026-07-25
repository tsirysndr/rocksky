ALTER TABLE "shouts" ADD COLUMN IF NOT EXISTS "gif_url" text;--> statement-breakpoint
ALTER TABLE "shouts" ADD COLUMN IF NOT EXISTS "gif_preview_url" text;--> statement-breakpoint
ALTER TABLE "shouts" ADD COLUMN IF NOT EXISTS "gif_alt" text;--> statement-breakpoint
ALTER TABLE "shouts" ADD COLUMN IF NOT EXISTS "gif_width" integer;--> statement-breakpoint
ALTER TABLE "shouts" ADD COLUMN IF NOT EXISTS "gif_height" integer;
