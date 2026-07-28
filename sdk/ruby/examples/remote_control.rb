# frozen_string_literal: true

# Remote control tour: a controllable player + a remote UI that drives it.
#
#   ruby -Ilib examples/remote_control.rb <ACCESS_TOKEN>
#
# Needs the native lib (built with the `remote-player` feature) — run
# ./build-core.sh first. Both roles speak the remote-control WebSocket protocol
# over the shared Rust core; heartbeat, reconnect, and the register handshake are
# handled for you.
require "rocksky"

token = ARGV[0] or abort "usage: ruby -Ilib examples/remote_control.rb <ACCESS_TOKEN>"

# --- Player: a controllable device -----------------------------------------
player = Rocksky::RemotePlayer.connect(token, "Ruby Example Player")

player.on(:play)  { puts "▶  play" }
player.on(:pause) { puts "⏸  pause" }
player.on(:next)  { puts "⏭  next" }
player.on(:previous) { puts "⏮  previous" }
player.on(:seek)  { |cmd| puts "⤢  seek to #{cmd[:position]}ms" }
player.on(:queue_jump)   { |cmd| puts "↦  jump to ##{cmd[:index]}" }
player.on(:queue_remove) { |cmd| puts "␡  remove ##{cmd[:index]}" }
player.on(:enqueue) do |cmd|
  puts "＋ enqueue #{cmd[:tracks]&.size} track(s) (mode=#{cmd[:mode]}, shuffle=#{cmd[:shuffle]})"
end
player.listen # background thread dispatching incoming commands

# Advertise what we're "playing".
player.set_now_playing(
  "title" => "Chaser", "artist" => "Calibro 35", "album" => "Jazzploitation",
  "albumArtist" => "Calibro 35", "durationMs" => 182_320, "elapsedMs" => 0,
  "isPlaying" => true
)
player.set_status("playing")
player.set_queue(
  [{ "title" => "Chaser", "artist" => "Calibro 35", "durationMs" => 182_320 }], 0
)

# --- Controller: a remote UI that observes & drives players ----------------
controller = Rocksky::RemoteController.connect(token, "Ruby Example Controller")

controller.on(:devices) do |e|
  puts "devices (primary=#{e[:primaryDevice].inspect}):"
  (e[:devices] || []).each { |d| puts "  #{d[:name]} (#{d[:deviceId]})" }
end
controller.on(:now_playing) do |e|
  t = e[:track] || {}
  puts "#{e[:deviceName]} ▸ #{t[:artist]} — #{t[:title]}"
end
controller.on(:status) { |e| puts "#{e[:deviceName]} status: #{e[:status]}" }
controller.on(:queue)  { |e| puts "#{e[:deviceName]} queue @#{e[:index]} (#{(e[:queue] || []).size})" }
controller.listen # background thread dispatching incoming events

# Drive a device (nil target broadcasts to all of the user's devices).
controller.pause(nil)
controller.seek(nil, 42_000)
# controller.set_primary("<device-id>")
# controller.enqueue(nil, [{ "trackId" => "…", "title" => "…", "artist" => "…" }],
#                    mode: "next", shuffle: false, start_index: 0)

# Let events flow for a bit, then tear everything down.
sleep 10
player.disconnect
controller.disconnect
player.close
controller.close
