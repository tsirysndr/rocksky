CREATE SCHEMA xata_private;

--
-- Name: xid; Type: DOMAIN; Schema: xata_private; Owner: -
--

CREATE DOMAIN xata_private.xid AS character(20)
	CONSTRAINT xid_check CHECK ((VALUE ~ '^[a-v0-9]{20}$'::text));

CREATE FUNCTION xata_private.xid(_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP) RETURNS xata_private.xid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    _t INT;
    _m INT;
    _p INT;
    _c INT;
BEGIN
    _t := floor(EXTRACT(epoch FROM _at));
    _m := xata_private._xid_machine_id();
    _p := pg_backend_pid();
    _c := nextval('xata_private.xid_serial')::INT;

    return xata_private.xid_encode(ARRAY [
            (_t >> 24) & 255, (_t >> 16) & 255, (_t >> 8) & 255 , _t & 255,
            (_m >> 16) & 255, (_m >> 8) & 255 , _m & 255,
            (_p >> 8) & 255, _p & 255,
            (_c >> 16) & 255, (_c >> 8) & 255 , _c & 255
        ]);
END;
$$;

CREATE FUNCTION xata_private._xid_machine_id() RETURNS integer
    LANGUAGE plpgsql IMMUTABLE
    AS $$
BEGIN
    RETURN (SELECT system_identifier & 16777215 FROM pg_control_system());
END;
$$;

CREATE FUNCTION xata_private.xid_encode(_id integer[]) RETURNS xata_private.xid
    LANGUAGE plpgsql
    AS $$
DECLARE
    _encoding CHAR(1)[] = '{0, 1, 2, 3, 4, 5, 6, 7, 8, 9, a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p, q, r, s, t, u, v}';
BEGIN
    RETURN _encoding[1 + (_id[1] >> 3)]
               || _encoding[1 + ((_id[2] >> 6) & 31 | (_id[1] << 2) & 31)]
               || _encoding[1 + ((_id[2] >> 1) & 31)]
               || _encoding[1 + ((_id[3] >> 4) & 31 | (_id[2] << 4) & 31)]
               || _encoding[1 + (_id[4] >> 7 | (_id[3] << 1) & 31)]
               || _encoding[1 + ((_id[4] >> 2) & 31)]
               || _encoding[1 + (_id[5] >> 5 | (_id[4] << 3) & 31)]
               || _encoding[1 + (_id[5] & 31)]
               || _encoding[1 + (_id[6] >> 3)]
               || _encoding[1 + ((_id[7] >> 6) & 31 | (_id[6] << 2) & 31)]
               || _encoding[1 + ((_id[7] >> 1) & 31)]
               || _encoding[1 + ((_id[8] >> 4) & 31 | (_id[7] << 4) & 31)]
               || _encoding[1 + (_id[9] >> 7 | (_id[8] << 1) & 31)]
               || _encoding[1 + ((_id[9] >> 2) & 31)]
               || _encoding[1 + ((_id[10] >> 5) | (_id[9] << 3) & 31)]
               || _encoding[1 + (_id[10] & 31)]
               || _encoding[1 + (_id[11] >> 3)]
               || _encoding[1 + ((_id[12] >> 6) & 31 | (_id[11] << 2) & 31)]
               || _encoding[1 + ((_id[12] >> 1) & 31)]
        || _encoding[1 + ((_id[12] << 4) & 31)];
END;
$$;

CREATE SEQUENCE xata_private.xid_serial
    START WITH 0
    INCREMENT BY 1
    MINVALUE 0
    MAXVALUE 16777215
    CACHE 1
    CYCLE;

CREATE OR REPLACE FUNCTION xata_id()
RETURNS text AS $$
SELECT 'rec_' || xata_private.xid();
$$ LANGUAGE sql IMMUTABLE;

CREATE TABLE "album_tracks" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id(),
	"album_id" text NOT NULL,
	"track_id" text NOT NULL,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL,
	"xata_version" integer
);
--> statement-breakpoint
CREATE TABLE "albums" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id(),
	"title" text NOT NULL,
	"artist" text NOT NULL,
	"release_date" text,
	"year" integer,
	"album_art" text,
	"uri" text,
	"artist_uri" text,
	"apple_music_link" text,
	"spotify_link" text,
	"tidal_link" text,
	"youtube_link" text,
	"sha256" text NOT NULL,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL,
	"xata_version" integer,
	CONSTRAINT "albums_uri_unique" UNIQUE("uri"),
	CONSTRAINT "albums_apple_music_link_unique" UNIQUE("apple_music_link"),
	CONSTRAINT "albums_spotify_link_unique" UNIQUE("spotify_link"),
	CONSTRAINT "albums_tidal_link_unique" UNIQUE("tidal_link"),
	CONSTRAINT "albums_youtube_link_unique" UNIQUE("youtube_link"),
	CONSTRAINT "albums_sha256_unique" UNIQUE("sha256")
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id(),
	"name" text NOT NULL,
	"api_key" text NOT NULL,
	"shared_secret" text NOT NULL,
	"description" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"user_id" text NOT NULL,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artist_albums" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id(),
	"artist_id" text NOT NULL,
	"album_id" text NOT NULL,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL,
	"xata_version" integer
);
--> statement-breakpoint
CREATE TABLE "artist_tracks" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id(),
	"artist_id" text NOT NULL,
	"track_id" text NOT NULL,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL,
	"xata_version" integer
);
--> statement-breakpoint
CREATE TABLE "artists" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id(),
	"name" text NOT NULL,
	"biography" text,
	"born" timestamp,
	"born_in" text,
	"died" timestamp,
	"picture" text,
	"sha256" text NOT NULL,
	"uri" text,
	"apple_music_link" text,
	"spotify_link" text,
	"tidal_link" text,
	"youtube_link" text,
	"genres" text[],
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL,
	"xata_version" integer,
	CONSTRAINT "artists_sha256_unique" UNIQUE("sha256"),
	CONSTRAINT "artists_uri_unique" UNIQUE("uri")
);
--> statement-breakpoint
CREATE TABLE "dropbox_accounts" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id(),
	"email" text NOT NULL,
	"is_beta_user" boolean DEFAULT false NOT NULL,
	"user_id" text NOT NULL,
	"xata_version" text,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dropbox_accounts_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "dropbox_directories" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id(),
	"name" text NOT NULL,
	"path" text NOT NULL,
	"parent_id" text,
	"dropbox_id" text NOT NULL,
	"file_id" text NOT NULL,
	"xata_version" text,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dropbox_directories_file_id_unique" UNIQUE("file_id")
);
--> statement-breakpoint
CREATE TABLE "dropbox_paths" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id(),
	"path" text NOT NULL,
	"name" text NOT NULL,
	"dropbox_id" text NOT NULL,
	"track_id" text NOT NULL,
	"directory_id" text,
	"file_id" text NOT NULL,
	"xata_version" text,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dropbox_paths_file_id_unique" UNIQUE("file_id")
);
--> statement-breakpoint
CREATE TABLE "dropbox_tokens" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id(),
	"refresh_token" text NOT NULL,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dropbox" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id(),
	"user_id" text NOT NULL,
	"dropbox_token_id" text NOT NULL,
	"xata_version" text,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_drive_accounts" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id(),
	"email" text NOT NULL,
	"is_beta_user" boolean DEFAULT false NOT NULL,
	"user_id" text NOT NULL,
	"xata_version" text,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "google_drive_accounts_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "google_drive_directories" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id(),
	"name" text NOT NULL,
	"path" text NOT NULL,
	"parent_id" text,
	"google_drive_id" text NOT NULL,
	"file_id" text NOT NULL,
	"xata_version" text,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "google_drive_directories_file_id_unique" UNIQUE("file_id")
);
--> statement-breakpoint
CREATE TABLE "google_drive_paths" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id(),
	"google_drive_id" text NOT NULL,
	"track_id" text NOT NULL,
	"name" text NOT NULL,
	"directory_id" text,
	"file_id" text NOT NULL,
	"xata_version" text,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "google_drive_paths_file_id_unique" UNIQUE("file_id")
);
--> statement-breakpoint
CREATE TABLE "google_drive_tokens" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id(),
	"refresh_token" text NOT NULL,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_drive" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id(),
	"google_drive_token_id" text NOT NULL,
	"user_id" text NOT NULL,
	"xata_version" text,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loved_tracks" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id(),
	"user_id" text NOT NULL,
	"track_id" text NOT NULL,
	"uri" text,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "loved_tracks_uri_unique" UNIQUE("uri")
);
--> statement-breakpoint
CREATE TABLE "playlist_tracks" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id(),
	"playlist_id" text NOT NULL,
	"track_id" text NOT NULL,
	"xata_createdat" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playlists" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id(),
	"name" text NOT NULL,
	"picture" text,
	"description" text,
	"uri" text,
	"spotify_link" text,
	"tidal_link" text,
	"apple_music_link" text,
	"created_by" text NOT NULL,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "playlists_uri_unique" UNIQUE("uri")
);
--> statement-breakpoint
CREATE TABLE "profile_shouts" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id(),
	"user_id" text NOT NULL,
	"shout_id" text NOT NULL,
	"xata_createdat" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "queue_tracks" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id(),
	"user_id" text NOT NULL,
	"track_id" text NOT NULL,
	"position" integer NOT NULL,
	"file_uri" text NOT NULL,
	"xata_version" integer DEFAULT 0 NOT NULL,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scrobbles" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id(),
	"user_id" text,
	"track_id" text,
	"album_id" text,
	"artist_id" text,
	"uri" text,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL,
	"xata_version" integer,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "scrobbles_uri_unique" UNIQUE("uri")
);
--> statement-breakpoint
CREATE TABLE "shout_likes" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id(),
	"user_id" text NOT NULL,
	"shout_id" text NOT NULL,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"uri" text NOT NULL,
	CONSTRAINT "shout_likes_uri_unique" UNIQUE("uri")
);
--> statement-breakpoint
CREATE TABLE "shout_reports" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id(),
	"user_id" text NOT NULL,
	"shout_id" text NOT NULL,
	"xata_createdat" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shouts" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id(),
	"content" text NOT NULL,
	"track_id" text,
	"artist_id" text,
	"album_id" text,
	"scrobble_id" text,
	"uri" text NOT NULL,
	"author_id" text NOT NULL,
	"parent_id" text,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shouts_uri_unique" UNIQUE("uri")
);
--> statement-breakpoint
CREATE TABLE "spotify_accounts" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id(),
	"xata_version" integer,
	"email" text NOT NULL,
	"user_id" text NOT NULL,
	"is_beta_user" boolean DEFAULT false NOT NULL,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spotify_tokens" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id(),
	"xata_version" integer,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"user_id" text NOT NULL,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracks" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id(),
	"title" text NOT NULL,
	"artist" text NOT NULL,
	"album_artist" text NOT NULL,
	"album_art" text,
	"album" text NOT NULL,
	"track_number" integer,
	"duration" integer NOT NULL,
	"mb_id" text,
	"youtube_link" text,
	"spotify_link" text,
	"apple_music_link" text,
	"tidal_link" text,
	"sha256" text NOT NULL,
	"disc_number" integer,
	"lyrics" text,
	"composer" text,
	"genre" text,
	"label" text,
	"copyright_message" text,
	"uri" text,
	"album_uri" text,
	"artist_uri" text,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL,
	"xata_version" integer,
	CONSTRAINT "tracks_mb_id_unique" UNIQUE("mb_id"),
	CONSTRAINT "tracks_youtube_link_unique" UNIQUE("youtube_link"),
	CONSTRAINT "tracks_spotify_link_unique" UNIQUE("spotify_link"),
	CONSTRAINT "tracks_apple_music_link_unique" UNIQUE("apple_music_link"),
	CONSTRAINT "tracks_tidal_link_unique" UNIQUE("tidal_link"),
	CONSTRAINT "tracks_sha256_unique" UNIQUE("sha256"),
	CONSTRAINT "tracks_uri_unique" UNIQUE("uri")
);
--> statement-breakpoint
CREATE TABLE "user_albums" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id(),
	"user_id" text NOT NULL,
	"album_id" text NOT NULL,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL,
	"xata_version" integer,
	"scrobbles" integer,
	"uri" text NOT NULL,
	CONSTRAINT "user_albums_uri_unique" UNIQUE("uri")
);
--> statement-breakpoint
CREATE TABLE "user_artists" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id(),
	"user_id" text NOT NULL,
	"artist_id" text NOT NULL,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL,
	"xata_version" integer,
	"scrobbles" integer,
	"uri" text NOT NULL,
	CONSTRAINT "user_artists_uri_unique" UNIQUE("uri")
);
--> statement-breakpoint
CREATE TABLE "user_playlists" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id(),
	"user_id" text NOT NULL,
	"playlist_id" text NOT NULL,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"uri" text NOT NULL,
	CONSTRAINT "user_playlists_uri_unique" UNIQUE("uri")
);
--> statement-breakpoint
CREATE TABLE "user_tracks" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id(),
	"user_id" text NOT NULL,
	"track_id" text NOT NULL,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL,
	"xata_version" integer,
	"uri" text NOT NULL,
	"scrobbles" integer,
	CONSTRAINT "user_tracks_uri_unique" UNIQUE("uri")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id(),
	"did" text NOT NULL,
	"display_name" text,
	"handle" text NOT NULL,
	"avatar" text NOT NULL,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL,
	"xata_version" integer,
	CONSTRAINT "users_did_unique" UNIQUE("did"),
	CONSTRAINT "users_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
CREATE TABLE "webscrobblers" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id(),
	"name" text NOT NULL,
	"uuid" text NOT NULL,
	"description" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"user_id" text NOT NULL,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "album_tracks" ADD CONSTRAINT "album_tracks_album_id_albums_xata_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "album_tracks" ADD CONSTRAINT "album_tracks_track_id_tracks_xata_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_xata_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_albums" ADD CONSTRAINT "artist_albums_artist_id_artists_xata_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_albums" ADD CONSTRAINT "artist_albums_album_id_albums_xata_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_tracks" ADD CONSTRAINT "artist_tracks_artist_id_artists_xata_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_tracks" ADD CONSTRAINT "artist_tracks_track_id_tracks_xata_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dropbox_accounts" ADD CONSTRAINT "dropbox_accounts_user_id_users_xata_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dropbox_directories" ADD CONSTRAINT "dropbox_directories_parent_id_dropbox_directories_xata_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."dropbox_directories"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dropbox_paths" ADD CONSTRAINT "dropbox_paths_directory_id_dropbox_directories_xata_id_fk" FOREIGN KEY ("directory_id") REFERENCES "public"."dropbox_directories"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dropbox" ADD CONSTRAINT "dropbox_user_id_users_xata_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dropbox" ADD CONSTRAINT "dropbox_dropbox_token_id_dropbox_tokens_xata_id_fk" FOREIGN KEY ("dropbox_token_id") REFERENCES "public"."dropbox_tokens"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_drive_accounts" ADD CONSTRAINT "google_drive_accounts_user_id_users_xata_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_drive_directories" ADD CONSTRAINT "google_drive_directories_parent_id_google_drive_directories_xata_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."google_drive_directories"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_drive_paths" ADD CONSTRAINT "google_drive_paths_directory_id_google_drive_directories_xata_id_fk" FOREIGN KEY ("directory_id") REFERENCES "public"."google_drive_directories"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_drive" ADD CONSTRAINT "google_drive_google_drive_token_id_google_drive_tokens_xata_id_fk" FOREIGN KEY ("google_drive_token_id") REFERENCES "public"."google_drive_tokens"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_drive" ADD CONSTRAINT "google_drive_user_id_users_xata_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loved_tracks" ADD CONSTRAINT "loved_tracks_user_id_users_xata_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loved_tracks" ADD CONSTRAINT "loved_tracks_track_id_tracks_xata_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_tracks" ADD CONSTRAINT "playlist_tracks_playlist_id_playlists_xata_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_tracks" ADD CONSTRAINT "playlist_tracks_track_id_tracks_xata_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlists" ADD CONSTRAINT "playlists_created_by_users_xata_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_shouts" ADD CONSTRAINT "profile_shouts_user_id_users_xata_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_shouts" ADD CONSTRAINT "profile_shouts_shout_id_shouts_xata_id_fk" FOREIGN KEY ("shout_id") REFERENCES "public"."shouts"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_tracks" ADD CONSTRAINT "queue_tracks_user_id_users_xata_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_tracks" ADD CONSTRAINT "queue_tracks_track_id_tracks_xata_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrobbles" ADD CONSTRAINT "scrobbles_user_id_users_xata_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrobbles" ADD CONSTRAINT "scrobbles_track_id_tracks_xata_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrobbles" ADD CONSTRAINT "scrobbles_album_id_albums_xata_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrobbles" ADD CONSTRAINT "scrobbles_artist_id_artists_xata_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shout_likes" ADD CONSTRAINT "shout_likes_user_id_users_xata_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shout_likes" ADD CONSTRAINT "shout_likes_shout_id_shouts_xata_id_fk" FOREIGN KEY ("shout_id") REFERENCES "public"."shouts"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shout_reports" ADD CONSTRAINT "shout_reports_user_id_users_xata_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shout_reports" ADD CONSTRAINT "shout_reports_shout_id_shouts_xata_id_fk" FOREIGN KEY ("shout_id") REFERENCES "public"."shouts"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shouts" ADD CONSTRAINT "shouts_track_id_tracks_xata_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shouts" ADD CONSTRAINT "shouts_artist_id_users_xata_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."users"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shouts" ADD CONSTRAINT "shouts_album_id_albums_xata_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shouts" ADD CONSTRAINT "shouts_scrobble_id_scrobbles_xata_id_fk" FOREIGN KEY ("scrobble_id") REFERENCES "public"."scrobbles"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shouts" ADD CONSTRAINT "shouts_author_id_users_xata_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shouts" ADD CONSTRAINT "shouts_parent_id_shouts_xata_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."shouts"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spotify_accounts" ADD CONSTRAINT "spotify_accounts_user_id_users_xata_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spotify_tokens" ADD CONSTRAINT "spotify_tokens_user_id_users_xata_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_albums" ADD CONSTRAINT "user_albums_user_id_users_xata_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_albums" ADD CONSTRAINT "user_albums_album_id_albums_xata_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_artists" ADD CONSTRAINT "user_artists_user_id_users_xata_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_artists" ADD CONSTRAINT "user_artists_artist_id_artists_xata_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_playlists" ADD CONSTRAINT "user_playlists_user_id_users_xata_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_playlists" ADD CONSTRAINT "user_playlists_playlist_id_tracks_xata_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."tracks"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tracks" ADD CONSTRAINT "user_tracks_user_id_users_xata_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tracks" ADD CONSTRAINT "user_tracks_track_id_tracks_xata_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webscrobblers" ADD CONSTRAINT "webscrobblers_user_id_users_xata_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("xata_id") ON DELETE no action ON UPDATE no action;