ALTER TABLE "album_tracks" ALTER COLUMN "xata_createdat" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "album_tracks" ALTER COLUMN "xata_createdat" SET DEFAULT now();