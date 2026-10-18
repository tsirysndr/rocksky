-- Remove retired Dropbox and Google Drive integrations. This deletes their stored data.
DROP TABLE IF EXISTS "dropbox_paths";
--> statement-breakpoint
DROP TABLE IF EXISTS "dropbox_directories";
--> statement-breakpoint
DROP TABLE IF EXISTS "dropbox";
--> statement-breakpoint
DROP TABLE IF EXISTS "dropbox_tokens";
--> statement-breakpoint
DROP TABLE IF EXISTS "dropbox_accounts";
--> statement-breakpoint
DROP TABLE IF EXISTS "google_drive_paths";
--> statement-breakpoint
DROP TABLE IF EXISTS "google_drive_directories";
--> statement-breakpoint
DROP TABLE IF EXISTS "google_drive";
--> statement-breakpoint
DROP TABLE IF EXISTS "google_drive_tokens";
--> statement-breakpoint
DROP TABLE IF EXISTS "google_drive_accounts";
