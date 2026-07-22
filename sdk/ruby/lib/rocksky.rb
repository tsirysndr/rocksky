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
  VERSION = "1.0.0"

  module C
    extend Fiddle::Importer
    dlload Native.resolve
    [
      "char* rocksky_profile(const char*, const char*)",
      "char* rocksky_scrobbles(const char*, const char*, unsigned int, unsigned int)",
      "char* rocksky_top_tracks(const char*, unsigned int, unsigned int)",
      "char* rocksky_global_stats(const char*)",
      "char* rocksky_song_hash(const char*, const char*, const char*)",
      "void rocksky_string_free(void*)",
      "char* rocksky_last_error()",
      "void* rocksky_agent_login(const char*, const char*, const char*, const char*)",
      "void rocksky_agent_free(void*)",
      "char* rocksky_agent_scrobble(void*, const char*)",
      "char* rocksky_agent_like(void*, const char*, const char*)",
      "char* rocksky_agent_follow(void*, const char*)",
      "char* rocksky_agent_shout(void*, const char*, const char*, const char*)",
      "char* rocksky_agent_refresh_session(void*)"
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

  # Identity hash — identical across every Rocksky SDK.
  def self.song_hash(title, artist, album)
    take_string(C.rocksky_song_hash(title, artist, album))
  end

  # ---- authenticated agent ----
  #
  # Records are passed as Hashes with camelCase keys (title, artist, album,
  # albumArtist, durationMs, …), matching the wire record shape.
  class Agent
    def self.login(session_path, identifier, password, appview: nil)
      ptr = C.rocksky_agent_login(session_path, identifier, password, appview.to_s)
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

    def like(uri, cid)
      Rocksky.unwrap(C.rocksky_agent_like(@ptr, uri, cid))
    end

    def follow(did)
      Rocksky.unwrap(C.rocksky_agent_follow(@ptr, did))
    end

    def shout(subject_uri, subject_cid, message)
      Rocksky.unwrap(C.rocksky_agent_shout(@ptr, subject_uri, subject_cid, message))
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
end
