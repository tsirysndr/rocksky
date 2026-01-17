CREATE TABLE `events` (
	`id` integer PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`did` text NOT NULL,
	`status` text,
	`handle` text,
	`is_active` integer,
	`collection` text,
	`rev` text,
	`rkey` text,
	`record` text,
	`live` integer,
	`cid` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_cid_unique` ON `events` (`cid`);--> statement-breakpoint
CREATE INDEX `did_idx` ON `events` (`did`);--> statement-breakpoint
CREATE INDEX `type_idx` ON `events` (`type`);--> statement-breakpoint
CREATE INDEX `collection_idx` ON `events` (`collection`);--> statement-breakpoint
CREATE INDEX `did_collection_rkey_idx` ON `events` (`did`,`collection`,`rkey`);