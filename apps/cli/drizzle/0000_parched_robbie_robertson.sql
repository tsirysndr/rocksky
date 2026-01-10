CREATE TABLE `album_tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`album_id` text NOT NULL,
	`track_id` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`album_id`) REFERENCES `albums`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `albums` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`artist` text NOT NULL,
	`release_date` text,
	`year` integer,
	`album_art` text,
	`uri` text,
	`cid` text NOT NULL,
	`artist_uri` text,
	`apple_music_link` text,
	`spotify_link` text,
	`tidal_link` text,
	`youtube_link` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `albums_uri_unique` ON `albums` (`uri`);--> statement-breakpoint
CREATE UNIQUE INDEX `albums_cid_unique` ON `albums` (`cid`);--> statement-breakpoint
CREATE UNIQUE INDEX `albums_apple_music_link_unique` ON `albums` (`apple_music_link`);--> statement-breakpoint
CREATE UNIQUE INDEX `albums_spotify_link_unique` ON `albums` (`spotify_link`);--> statement-breakpoint
CREATE UNIQUE INDEX `albums_tidal_link_unique` ON `albums` (`tidal_link`);--> statement-breakpoint
CREATE UNIQUE INDEX `albums_youtube_link_unique` ON `albums` (`youtube_link`);--> statement-breakpoint
CREATE TABLE `artist_albums` (
	`id` text PRIMARY KEY NOT NULL,
	`artist_id` text NOT NULL,
	`album_id` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`artist_id`) REFERENCES `artists`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`album_id`) REFERENCES `albums`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `artist_tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`artist_id` text NOT NULL,
	`track_id` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`artist_id`) REFERENCES `artists`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `artists` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`biography` text,
	`born` integer,
	`born_in` text,
	`died` integer,
	`picture` text,
	`uri` text,
	`cid` text NOT NULL,
	`apple_music_link` text,
	`spotify_link` text,
	`tidal_link` text,
	`youtube_link` text,
	`genres` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `artists_uri_unique` ON `artists` (`uri`);--> statement-breakpoint
CREATE UNIQUE INDEX `artists_cid_unique` ON `artists` (`cid`);--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`key` text PRIMARY KEY NOT NULL,
	`session` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `loved_tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`track_id` text NOT NULL,
	`uri` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `loved_tracks_uri_unique` ON `loved_tracks` (`uri`);--> statement-breakpoint
CREATE TABLE `scrobbles` (
	`xata_id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`track_id` text,
	`album_id` text,
	`artist_id` text,
	`uri` text,
	`cid` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`timestamp` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`album_id`) REFERENCES `albums`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`artist_id`) REFERENCES `artists`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scrobbles_uri_unique` ON `scrobbles` (`uri`);--> statement-breakpoint
CREATE UNIQUE INDEX `scrobbles_cid_unique` ON `scrobbles` (`cid`);--> statement-breakpoint
CREATE TABLE `tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`artist` text NOT NULL,
	`album_artist` text NOT NULL,
	`album_art` text,
	`album` text NOT NULL,
	`track_number` integer,
	`duration` integer NOT NULL,
	`mb_id` text,
	`youtube_link` text,
	`spotify_link` text,
	`apple_music_link` text,
	`tidal_link` text,
	`disc_number` integer,
	`lyrics` text,
	`composer` text,
	`genre` text,
	`label` text,
	`copyright_message` text,
	`uri` text,
	`cid` text NOT NULL,
	`album_uri` text,
	`artist_uri` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tracks_mb_id_unique` ON `tracks` (`mb_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tracks_youtube_link_unique` ON `tracks` (`youtube_link`);--> statement-breakpoint
CREATE UNIQUE INDEX `tracks_spotify_link_unique` ON `tracks` (`spotify_link`);--> statement-breakpoint
CREATE UNIQUE INDEX `tracks_apple_music_link_unique` ON `tracks` (`apple_music_link`);--> statement-breakpoint
CREATE UNIQUE INDEX `tracks_tidal_link_unique` ON `tracks` (`tidal_link`);--> statement-breakpoint
CREATE UNIQUE INDEX `tracks_uri_unique` ON `tracks` (`uri`);--> statement-breakpoint
CREATE UNIQUE INDEX `tracks_cid_unique` ON `tracks` (`cid`);--> statement-breakpoint
CREATE TABLE `user_albums` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`artist_id` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`scrobbles` integer,
	`uri` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`artist_id`) REFERENCES `artists`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_albums_uri_unique` ON `user_albums` (`uri`);--> statement-breakpoint
CREATE TABLE `user_tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`track_id` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`scrobbles` integer,
	`uri` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_tracks_uri_unique` ON `user_tracks` (`uri`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`did` text NOT NULL,
	`display_name` text,
	`handle` text NOT NULL,
	`avatar` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_did_unique` ON `users` (`did`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_handle_unique` ON `users` (`handle`);