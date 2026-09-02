# frozen_string_literal: true

module Rocksky
  # RemotePlayer — build a Rocksky-controllable player in a few lines.
  #
  # It speaks the remote-control WebSocket protocol (see remote-ws/PROTOCOL.md)
  # over the shared Rust core: it registers as a device, advertises what you're
  # playing (now-playing / status / queue), and invokes your handlers when a
  # miniplayer sends a command (play/pause/next/previous/seek/enqueue/queue
  # actions). Heartbeat, reconnect, and the device-id handshake are handled for
  # you inside the core.
  #
  # Commands arrive over a blocking poll (#next_command). Register handlers with
  # #on and call #listen to spawn a background thread that dispatches them, so you
  # never write the loop yourself.
  #
  #   player = Rocksky::RemotePlayer.connect(token, "My Player")
  #   player.on(:play)  { engine.play }
  #   player.on(:pause) { engine.pause }
  #   player.on(:seek)  { |cmd| engine.seek(cmd[:position]) }
  #   player.listen
  #   # …then, as your engine plays:
  #   player.set_now_playing(title: "Chaser", artist: "Calibro 35",
  #                          durationMs: 182_320, elapsedMs: 0, isPlaying: true)
  #   player.set_status("playing")
  #   player.set_queue(items, 0)
  #
  # Records (now-playing / queue items) are passed as Hashes with camelCase keys
  # (title, artist, album, albumArtist, albumArt, durationMs, elapsedMs,
  # isPlaying, codec, sampleRate / songUri, albumUri, trackNumber), matching the
  # wire record shape.
  class RemotePlayer
    # Connect and register a controllable player in the background. +token+ is a
    # Rocksky access token (JWT); +name+ is the device-picker label; +url+
    # defaults to the public endpoint when omitted.
    def self.connect(token, name, url: nil)
      ptr = C.rocksky_remote_player_connect(token.to_s, name.to_s, url.to_s)
      raise Error, (Rocksky.take_string(C.rocksky_last_error()) || "connect failed") if ptr.null?

      new(ptr)
    end

    def initialize(ptr)
      @ptr = ptr
      @handlers = {}
      @thread = nil
    end

    # Register a handler for a command action, one of +:play+, +:pause+, +:next+,
    # +:previous+, +:seek+, +:queue_jump+, +:queue_remove+, +:queue_move+,
    # +:enqueue+, +:shuffle+, +:repeat+, +:volume+, +:audio_settings+. The block
    # receives the full symbol-keyed command Hash (e.g. +{ action: "seek",
    # position: 42000 }+). Returns +self+ for chaining.
    def on(action, &block)
      @handlers[action.to_sym] = block
      self
    end

    # Block until the next controller command, returned as a symbol-keyed Hash
    # (e.g. +{ action: "play" }+), or +nil+ once disconnected.
    def next_command
      return nil if @ptr.null?

      cmd = Rocksky.unwrap(C.rocksky_remote_player_next_command(@ptr))
      cmd && Rocksky.symbolize(cmd)
    end

    # Spawn a background thread that polls #next_command and dispatches each
    # command to its registered handler until the player disconnects. Returns the
    # Thread.
    def listen
      @thread ||= Thread.new do
        loop do
          cmd = next_command
          break if cmd.nil?

          dispatch(cmd)
        end
      end
    end

    # Advertise the currently-playing track. Call whenever it changes, and
    # periodically (~every 1–4s) with a fresh +elapsedMs+ so controllers show
    # smooth progress. +track+ is a camelCase Hash. Optional audio info —
    # +codec+ (audio codec/container, e.g. "mp3", "flac") and +sampleRate+
    # (sample rate in Hz, e.g. 44100) — is included in the track payload when
    # set, and omitted otherwise.
    def set_now_playing(track)
      Rocksky.unwrap(C.rocksky_remote_player_set_now_playing(@ptr, JSON.generate(track)))
    end

    # Advertise transport state: "playing", "paused", or "stopped".
    def set_status(status)
      Rocksky.unwrap(C.rocksky_remote_player_set_status(@ptr, status.to_s))
    end

    # Advertise the playback queue (+items+ is an array of camelCase queue-item
    # Hashes) and the active +index+.
    def set_queue(items, index)
      Rocksky.unwrap(C.rocksky_remote_player_set_queue(@ptr, JSON.generate(items), index))
    end

    # Disconnect and stop the background task. #next_command then returns nil,
    # which ends the #listen thread. The handle stays valid until #close.
    def disconnect
      Rocksky.unwrap(C.rocksky_remote_player_disconnect(@ptr))
    end

    # Release the native handle. The player is unusable afterwards.
    def close
      return if @ptr.null?

      # Stop the background task so a blocked #next_command returns nil and the
      # #listen loop exits, then WAIT for that thread to leave the native call
      # before freeing — freeing the handle while a poll is in flight is a
      # use-after-free (segfault).
      C.rocksky_remote_player_disconnect(@ptr)
      @thread&.join unless @thread == Thread.current
      @thread = nil
      C.rocksky_remote_player_free(@ptr)
      @ptr = Fiddle::Pointer.new(0)
    end

    private

    def dispatch(cmd)
      handler = @handlers[cmd[:action]&.to_sym]
      handler&.call(cmd)
    end
  end

  # RemoteController — build a Rocksky remote UI in a few lines.
  #
  # The other half of the remote-control WebSocket protocol: where
  # {RemotePlayer} is a controllable player, a controller lists the user's
  # players, observes what each is playing (now-playing / status / queue), picks
  # the primary device, and sends commands. Heartbeat, reconnect, and the
  # register handshake are handled for you inside the core.
  #
  # Events arrive over a blocking poll (#next_event). Register handlers with #on
  # and call #listen to spawn a background dispatch thread.
  #
  #   controller = Rocksky::RemoteController.connect(token, "My Controller")
  #   controller.on(:devices)     { |e| render(e[:devices]) }
  #   controller.on(:now_playing) { |e| show_track(e[:deviceId], e[:track]) }
  #   controller.listen
  #   # …then drive a device:
  #   controller.set_primary(device_id)
  #   controller.pause(device_id)
  #   controller.seek(device_id, 42_000)
  #
  # A +nil+ / omitted +target+ broadcasts a command to all of the user's devices.
  class RemoteController
    # Connect and register a controller in the background. +url+ defaults to the
    # public endpoint when omitted.
    def self.connect(token, name, url: nil)
      ptr = C.rocksky_remote_controller_connect(token.to_s, name.to_s, url.to_s)
      raise Error, (Rocksky.take_string(C.rocksky_last_error()) || "connect failed") if ptr.null?

      new(ptr)
    end

    def initialize(ptr)
      @ptr = ptr
      @handlers = {}
      @thread = nil
    end

    # Register a handler for a server event type, one of +:devices+,
    # +:device_registered+, +:device_unregistered+, +:primary_changed+,
    # +:now_playing+, +:status+, +:queue+. The block receives the full
    # symbol-keyed event Hash. A +:now_playing+ event carries the advertised
    # track under +:track+, including optional +:codec+ / +:sampleRate+ audio
    # info when the player supplied it. Returns +self+ for chaining.
    def on(event_type, &block)
      @handlers[event_type.to_sym] = block
      self
    end

    # Block until the next update, returned as a symbol-keyed Hash (each carries a
    # +:type+), or +nil+ once disconnected.
    def next_event
      return nil if @ptr.null?

      ev = Rocksky.unwrap(C.rocksky_remote_controller_next_event(@ptr))
      ev && Rocksky.symbolize(ev)
    end

    # Spawn a background thread that polls #next_event and dispatches each event
    # to its registered handler until the controller disconnects. Returns the
    # Thread.
    def listen
      @thread ||= Thread.new do
        loop do
          ev = next_event
          break if ev.nil?

          dispatch(ev)
        end
      end
    end

    # Choose the primary (scrobble/profile) device.
    def set_primary(device_id)
      Rocksky.unwrap(C.rocksky_remote_controller_set_primary(@ptr, device_id.to_s))
    end

    # +play+. +target+ is a device id, or omit/nil to broadcast to all devices.
    def play(target = nil)
      command("play", target)
    end

    def pause(target = nil)
      command("pause", target)
    end

    def next(target = nil)
      command("next", target)
    end

    def previous(target = nil)
      command("previous", target)
    end

    # Send a simple command ("play" | "pause" | "next" | "previous").
    def command(action, target = nil)
      Rocksky.unwrap(C.rocksky_remote_controller_command(@ptr, action.to_s, target.to_s))
    end

    # Seek +target+ to +position_ms+ (nil target = broadcast).
    def seek(target, position_ms)
      Rocksky.unwrap(C.rocksky_remote_controller_seek(@ptr, target.to_s, position_ms))
    end

    # Jump to +index+ in +target+'s queue (nil target = broadcast).
    def queue_jump(target, index)
      Rocksky.unwrap(C.rocksky_remote_controller_queue_jump(@ptr, target.to_s, index))
    end

    # Remove queue item +index+ on +target+ (nil target = broadcast).
    def queue_remove(target, index)
      Rocksky.unwrap(C.rocksky_remote_controller_queue_remove(@ptr, target.to_s, index))
    end

    # Move queue item +from+ to position +to+ on the target device (arrayMove
    # semantics; empty target broadcasts).
    def queue_move(target, from, to)
      Rocksky.unwrap(C.rocksky_remote_controller_queue_move(@ptr, target.to_s, from, to))
    end

    # Turn queue shuffle on/off (empty target broadcasts). A player without
    # shuffle ignores it.
    def set_shuffle(target, enabled)
      Rocksky.unwrap(C.rocksky_remote_controller_set_shuffle(@ptr, target.to_s, enabled ? 1 : 0))
    end

    # Set the queue repeat mode: "off" | "all" | "one" (empty target
    # broadcasts). A player without repeat ignores it.
    def set_repeat(target, mode)
      Rocksky.unwrap(C.rocksky_remote_controller_set_repeat(@ptr, target.to_s, mode.to_s))
    end

    # Set output volume 0.0..=1.0 (empty target broadcasts). A player without
    # volume control ignores it.
    def set_volume(target, volume)
      Rocksky.unwrap(C.rocksky_remote_controller_set_volume(@ptr, target.to_s, volume.to_f.clamp(0.0, 1.0)))
    end

    # Apply a partial audio-settings document — +settings_json+ is the JSON of
    # the protocol's +audio_settings+ args (PROTOCOL.md §6.1). Raises on
    # invalid JSON rather than silently sending nothing.
    def set_audio_settings(target, settings_json)
      Rocksky.unwrap(C.rocksky_remote_controller_set_audio_settings(@ptr, target.to_s, settings_json.to_s))
    end

    # Enqueue +tracks+ (array of camelCase queue-item Hashes) on +target+. +mode+
    # is "now" | "next" | "last"; nil target = broadcast.
    def enqueue(target, tracks, mode: "now", shuffle: false, start_index: 0)
      Rocksky.unwrap(C.rocksky_remote_controller_enqueue(
                       @ptr, target.to_s, JSON.generate(tracks), mode.to_s, shuffle ? 1 : 0, start_index
                     ))
    end

    # Disconnect and stop the background task. #next_event then returns nil, which
    # ends the #listen thread. The handle stays valid until #close.
    def disconnect
      Rocksky.unwrap(C.rocksky_remote_controller_disconnect(@ptr))
    end

    # Release the native handle. The controller is unusable afterwards.
    def close
      return if @ptr.null?

      # Stop the background task so a blocked #next_event returns nil and the
      # #listen loop exits, then WAIT for that thread to leave the native call
      # before freeing — freeing the handle while a poll is in flight is a
      # use-after-free (segfault).
      C.rocksky_remote_controller_disconnect(@ptr)
      @thread&.join unless @thread == Thread.current
      @thread = nil
      C.rocksky_remote_controller_free(@ptr)
      @ptr = Fiddle::Pointer.new(0)
    end

    private

    def dispatch(event)
      handler = @handlers[event[:type]&.to_sym]
      handler&.call(event)
    end
  end
end
