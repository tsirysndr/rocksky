# frozen_string_literal: true

# Official Ruby SDK for Rocksky.
#
# A thin binding, via Ruby's stdlib `fiddle` (no `ffi` gem), to the plain C ABI
# of the shared Rust core (`rocksky-uniffi` → `rocksky-sdk`): AppView reads, AT
# Protocol PDS writes (scrobble fan-out, like, follow, shout) and the identity
# hashes — the same engine behind every Rocksky SDK.
#
#     require "rocksky"
#     Rocksky.global_stats
#     agent = Rocksky::Agent.login("session.json", "alice.bsky.social", "app-pw")
require "fiddle"
require "fiddle/import"
require "json"
require_relative "rocksky/native"

module Rocksky
  require_relative "rocksky/version"

  module C
    extend Fiddle::Importer
    dlload Native.resolve
    [
      "char* rocksky_profile(const char*, const char*)",
      "char* rocksky_scrobbles(const char*, const char*, unsigned int, unsigned int)",
      "char* rocksky_top_tracks(const char*, unsigned int, unsigned int)",
      "char* rocksky_global_stats(const char*)",
      "char* rocksky_get(const char*, const char*, const char*, const char*)",
      "char* rocksky_post(const char*, const char*, const char*, const char*)",
      "char* rocksky_update_seen(const char*, const char*, const char*)",
      "char* rocksky_library_get(const char*, const char*, const char*, const char*)",
      "char* rocksky_library_post(const char*, const char*, const char*, const char*)",
      "char* rocksky_match_song(const char*, const char*, const char*, const char*, const char*, const char*)",
      "char* rocksky_top_tracks_interval(const char*, unsigned int, unsigned int, const char*, unsigned int, const char*, const char*)",
      "char* rocksky_top_artists_interval(const char*, unsigned int, unsigned int, const char*, unsigned int, const char*, const char*)",
      "char* rocksky_song_hash(const char*, const char*, const char*)",
      "void rocksky_string_free(void*)",
      "char* rocksky_last_error()",
      "void* rocksky_agent_login(const char*, const char*, const char*, const char*, const char*)",
      "void rocksky_agent_free(void*)",
      "char* rocksky_agent_scrobble(void*, const char*)",
      "char* rocksky_agent_scrobble_match(void*, const char*)",
      "char* rocksky_agent_sync_repo(void*)",
      "char* rocksky_agent_hydrate_from_jetstream(void*)",
      "char* rocksky_agent_like(void*, const char*, const char*)",
      "char* rocksky_agent_follow(void*, const char*)",
      "char* rocksky_agent_shout(void*, const char*, const char*, const char*)",
      "char* rocksky_agent_shout_with_gif(void*, const char*, const char*, const char*, const char*)",
      "char* rocksky_agent_reply_shout_with_gif(void*, const char*, const char*, const char*, const char*, const char*, const char*)",
      "char* rocksky_agent_refresh_session(void*)",
      # ---- remote player (a controllable device) ----
      "void* rocksky_remote_player_connect(const char*, const char*, const char*)",
      "char* rocksky_remote_player_next_command(void*)",
      "char* rocksky_remote_player_set_now_playing(void*, const char*)",
      "char* rocksky_remote_player_set_status(void*, const char*)",
      "char* rocksky_remote_player_set_queue(void*, const char*, unsigned int)",
      "char* rocksky_remote_player_disconnect(void*)",
      "void rocksky_remote_player_free(void*)",
      # ---- remote controller (a remote UI: drive & observe players) ----
      "void* rocksky_remote_controller_connect(const char*, const char*, const char*)",
      "char* rocksky_remote_controller_next_event(void*)",
      "char* rocksky_remote_controller_set_primary(void*, const char*)",
      "char* rocksky_remote_controller_command(void*, const char*, const char*)",
      "char* rocksky_remote_controller_seek(void*, const char*, unsigned long long)",
      "char* rocksky_remote_controller_queue_jump(void*, const char*, unsigned int)",
      "char* rocksky_remote_controller_queue_remove(void*, const char*, unsigned int)",
      "char* rocksky_remote_controller_enqueue(void*, const char*, const char*, const char*, char, unsigned int)",
      "char* rocksky_remote_controller_disconnect(void*)",
      "void rocksky_remote_controller_free(void*)"
    ].each { |sig| extern sig }
  end
  private_constant :C

  # C strings the core returns aren't length-tagged; resolve length via strlen.
  STRLEN = Fiddle::Function.new(
    Fiddle::Handle::DEFAULT["strlen"], [Fiddle::TYPE_VOIDP], Fiddle::TYPE_SIZE_T
  )
  private_constant :STRLEN

  # Copy an owned C string into a Ruby string and free the original.
  def self.take_string(ptr)
    return nil if ptr.nil? || ptr.null?

    len = STRLEN.call(ptr)
    str = ptr[0, len].force_encoding("UTF-8")
    C.rocksky_string_free(ptr)
    str
  end

  # Parse a `{"ok"|"error"}` envelope, raising Error on failure.
  def self.unwrap(ptr)
    parsed = JSON.parse(take_string(ptr))
    raise Error, parsed["error"] if parsed.key?("error")

    parsed["ok"]
  end

  # Recursively convert Hash string keys to symbols (Arrays walked too). Used by
  # the remote-control glue so commands/events reach handlers as symbol-keyed
  # hashes (e.g. cmd[:action], event[:type]).
  def self.symbolize(obj)
    case obj
    when Hash
      obj.each_with_object({}) { |(k, v), acc| acc[k.to_sym] = symbolize(v) }
    when Array
      obj.map { |e| symbolize(e) }
    else
      obj
    end
  end

  # ---- reads (unauthenticated; base: overrides the AppView URL) ----

  def self.profile(actor, base: nil)
    unwrap(C.rocksky_profile(base.to_s, actor))
  end

  def self.scrobbles(actor, limit: 50, offset: 0, base: nil)
    unwrap(C.rocksky_scrobbles(base.to_s, actor, limit, offset))
  end

  def self.top_tracks(limit: 50, offset: 0, base: nil)
    unwrap(C.rocksky_top_tracks(base.to_s, limit, offset))
  end

  def self.global_stats(base: nil)
    unwrap(C.rocksky_global_stats(base.to_s))
  end

  # ---- catalog + feed reads with RSQL filtering ----
  #
  # +filter:+ accepts a Rocksky::Filter (see rocksky/filter.rb) or a raw RSQL
  # String. Fields are Symbols, e.g. Rocksky::Filter.eq(:artist, "Daft Punk").

  # The song catalog (app.rocksky.song.getSongs), optionally narrowed by
  # +genre:+ and/or an RSQL +filter:+. Returns { "tracks" => [...] }.
  def self.catalog_songs(limit: 50, offset: 0, genre: nil, filter: nil, base: nil)
    get("app.rocksky.song.getSongs", catalog_params(limit, offset, genre, filter), base: base)
  end

  # The artist catalog (app.rocksky.artist.getArtists). Returns
  # { "artists" => [...] }.
  def self.catalog_artists(limit: 50, offset: 0, genre: nil, filter: nil, base: nil)
    get("app.rocksky.artist.getArtists", catalog_params(limit, offset, genre, filter), base: base)
  end

  # The album catalog (app.rocksky.album.getAlbums). Returns
  # { "albums" => [...] }.
  def self.catalog_albums(limit: 50, offset: 0, genre: nil, filter: nil, base: nil)
    get("app.rocksky.album.getAlbums", catalog_params(limit, offset, genre, filter), base: base)
  end

  # A social/global scrobbles feed (app.rocksky.scrobble.getScrobbles). Pass
  # +did:+ to scope to an actor and +following: true+ for their follow graph.
  # +filter:+ reaches the joined track/user/artist via dotted fields, e.g.
  # Rocksky::Filter.eq(:"track.artist", "Daft Punk"). Returns
  # { "scrobbles" => [...] }.
  def self.scrobble_feed(did: nil, following: false, limit: 50, offset: 0, filter: nil, base: nil)
    params = { limit: limit, offset: offset }
    params[:did] = did unless did.nil?
    params[:following] = following if following
    params[:filter] = filter.to_s unless filter.nil?
    get("app.rocksky.scrobble.getScrobbles", params, base: base)
  end

  # Shared param assembly for the three catalog reads (omit-nil idiom).
  def self.catalog_params(limit, offset, genre, filter)
    params = { limit: limit, offset: offset }
    params[:genre] = genre unless genre.nil?
    params[:filter] = filter.to_s unless filter.nil?
    params
  end
  private_class_method :catalog_params

  # Universal read escape hatch — call any app.rocksky.* query by nsid. +params+
  # is a hash of string params; the whole read-query catalog is reachable here.
  #
  #   Rocksky.get("app.rocksky.album.getAlbum", { uri: uri })
  #   Rocksky.get("app.rocksky.charts.getScrobblesChart", { did: did })
  # +token+, when given, is sent as an Authorization: Bearer header — needed for
  # auth-gated queries.
  def self.get(nsid, params = {}, base: nil, token: nil)
    unwrap(C.rocksky_get(base.to_s, nsid, JSON.generate(params), token.to_s))
  end

  # Universal write escape hatch — call any app.rocksky.* procedure whose
  # arguments ride the query string. Most are auth-gated, so pass +token+.
  #
  #   Rocksky.post("app.rocksky.playlist.removePlaylist", { uri: uri }, token: tok)
  def self.post(nsid, params = {}, base: nil, token: nil)
    unwrap(C.rocksky_post(base.to_s, nsid, JSON.generate(params), token.to_s))
  end

  # ---- notifications (auth-gated; +token+ required) ----

  # The authenticated viewer's unread-notification count. Returns
  # { "count" => Integer }.
  def self.unread_count(token:, base: nil)
    get("app.rocksky.notification.getUnreadCount", {}, base: base, token: token)
  end

  # The authenticated viewer's notifications, most recent first. +limit+ defaults
  # to 30 server-side; +cursor+ paginates. Returns
  # { "notifications" => [...], "unreadCount" => Integer, "cursor" => String? }.
  def self.notifications(token:, limit: nil, cursor: nil, base: nil)
    params = {}
    params[:limit] = limit unless limit.nil?
    params[:cursor] = cursor unless cursor.nil?
    get("app.rocksky.notification.listNotifications", params, base: base, token: token)
  end

  # Mark notifications as viewed. +ids+ is an array of notification ids, or an
  # empty array to mark *all* as viewed. Returns { "unreadCount" => Integer }.
  def self.update_seen(token:, ids: [], base: nil)
    unwrap(C.rocksky_update_seen(base.to_s, token.to_s, JSON.generate(ids)))
  end

  # Resolve full canonical metadata for a bare title + artist (matchSong).
  # +album+ steers the match toward that release (case-insensitive) so a
  # remaster/live/single edition doesn't shadow the intended album.
  def self.match_song(title, artist, album: nil, mb_id: nil, isrc: nil, base: nil)
    unwrap(C.rocksky_match_song(base.to_s, title, artist, album.to_s, mb_id.to_s, isrc.to_s))
  end

  # Top tracks chart over a typed date window. +interval+ is +:all+, or a pair
  # like +[:days, 7]+ / +[:weeks, 4]+ / +[:months, 1]+ / +[:years, 1]+, or
  # +[:range, start_rfc3339, end_rfc3339]+.
  #
  #   Rocksky.top_tracks_interval(limit: 10, interval: [:days, 7])
  def self.top_tracks_interval(limit: 50, offset: 0, interval: :all, base: nil)
    unit, n, s, e = interval_parts(interval)
    unwrap(C.rocksky_top_tracks_interval(base.to_s, limit, offset, unit, n, s, e))
  end

  # Top artists chart over a typed date window (see .top_tracks_interval).
  def self.top_artists_interval(limit: 50, offset: 0, interval: :all, base: nil)
    unit, n, s, e = interval_parts(interval)
    unwrap(C.rocksky_top_artists_interval(base.to_s, limit, offset, unit, n, s, e))
  end

  # Normalize an interval into (unit, n, start, end) for the native call.
  def self.interval_parts(interval)
    case interval
    when :all, nil then ["all", 0, "", ""]
    when Array
      kind, a, b = interval
      return ["range", 0, a.to_s, b.to_s] if kind == :range

      [kind.to_s, Integer(a), "", ""]
    else
      raise Error, "invalid interval: #{interval.inspect}"
    end
  end
  private_class_method :interval_parts

  # Identity hash — identical across every Rocksky SDK.
  def self.song_hash(title, artist, album)
    take_string(C.rocksky_song_hash(title, artist, album))
  end

  # ---- authenticated agent ----
  #
  # Records are passed as Hashes with camelCase keys (title, artist, album,
  # albumArtist, durationMs, …), matching the wire record shape.
  class Agent
    # +dedup_path+ enables the local dedup index (needed for #sync_repo /
    # #hydrate_from_jetstream).
    def self.login(session_path, identifier, password, appview: nil, dedup_path: nil)
      ptr = C.rocksky_agent_login(session_path, identifier, password, appview.to_s, dedup_path.to_s)
      raise Error, (Rocksky.take_string(C.rocksky_last_error()) || "login failed") if ptr.null?

      new(ptr)
    end

    def initialize(ptr)
      @ptr = ptr
    end

    # Scrobble a play; fans out to artist/album/song/scrobble. Returns the URIs.
    def scrobble(track)
      Rocksky.unwrap(C.rocksky_agent_scrobble(@ptr, JSON.generate(track)))
    end

    # Scrobble from just a title + artist (album optional, plus optional mb_id /
    # isrc anchors): resolve full metadata via matchSong, then fan out.
    # Scrobble from just a title + artist. +input+ is a Hash with camelCase keys:
    # required "title"/"artist"; optional "album", "mbId", "isrc" (match anchors),
    # and "timestamp" (scrobbled-at Unix seconds, default now).
    #
    #   agent.scrobble_match("title" => "Chaser", "artist" => "Calibro 35")
    def scrobble_match(input)
      Rocksky.unwrap(C.rocksky_agent_scrobble_match(@ptr, JSON.generate(input)))
    end

    # Download the caller's repo and (re)build the local dedup index (needs a
    # dedup_path at login). Returns the per-collection counts.
    def sync_repo
      Rocksky.unwrap(C.rocksky_agent_sync_repo(@ptr))
    end

    # Keep the local dedup index hydrated from Jetstream in the background.
    def hydrate_from_jetstream
      Rocksky.unwrap(C.rocksky_agent_hydrate_from_jetstream(@ptr))
    end

    def like(uri, cid)
      Rocksky.unwrap(C.rocksky_agent_like(@ptr, uri, cid))
    end

    def follow(did)
      Rocksky.unwrap(C.rocksky_agent_follow(@ptr, did))
    end

    def shout(subject_uri, subject_cid, message)
      Rocksky.unwrap(C.rocksky_agent_shout(@ptr, subject_uri, subject_cid, message))
    end

    # Post a shout with an optional GIF/sticker/clip attachment. Pass at least
    # one of +message+ / +gif+. +gif+ is a Hash with camelCase keys ("url"
    # required, plus "previewUrl", "alt", "width", "height").
    def shout_with_gif(subject_uri, subject_cid, message: nil, gif: nil)
      Rocksky.unwrap(C.rocksky_agent_shout_with_gif(
                       @ptr, subject_uri, subject_cid, message.to_s, gif ? JSON.generate(gif) : ""
                     ))
    end

    # Reply to a shout with an optional GIF/sticker/clip attachment. Semantics
    # match #shout_with_gif, plus a parent strong-ref (+parent_uri+/+parent_cid+).
    def reply_shout_with_gif(subject_uri, subject_cid, parent_uri, parent_cid, message: nil, gif: nil)
      Rocksky.unwrap(C.rocksky_agent_reply_shout_with_gif(
                       @ptr, subject_uri, subject_cid, parent_uri, parent_cid,
                       message.to_s, gif ? JSON.generate(gif) : ""
                     ))
    end

    def refresh_session
      Rocksky.unwrap(C.rocksky_agent_refresh_session(@ptr))
    end

    # Release the native handle. The agent is unusable afterwards.
    def close
      return if @ptr.null?

      C.rocksky_agent_free(@ptr)
      @ptr = Fiddle::Pointer.new(0)
    end
  end

  # Build an authenticated app.rocksky.library.* (uploaded-music) client. The
  # token is required — every library method is auth-gated.
  #
  #   lib = Rocksky.library(token)
  #   lib.get_song(song_id)
  def self.library(token, base: nil)
    Library.new(token, base: base)
  end
end

require_relative "rocksky/filter"
require_relative "rocksky/library"
require_relative "rocksky/playlist"
require_relative "rocksky/remote"
