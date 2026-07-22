# frozen_string_literal: true

# Read-only tour of the native Rocksky core (no auth needed).
#
#   ruby -Ilib examples/native_core.rb
#
# Needs the native lib — run ./build-core.sh first.
# The write side (login + scrobble) is shown commented at the bottom.
require "rocksky"

stats = Rocksky.global_stats
puts "global: #{stats["scrobbles"]} scrobbles · #{stats["users"]} users · #{stats["tracks"]} tracks"

puts "top tracks:"
Rocksky.top_tracks(limit: 5).each do |t|
  puts "  #{t["artist"]} — #{t["title"]}"
end

puts "song hash: #{Rocksky.song_hash("Chaser", "Calibro 35", "Jazzploitation")}"

# --- write side (uncomment with real credentials) ---
# agent = Rocksky::Agent.login("session.json", "alice.bsky.social", "app-pw")
# out = agent.scrobble(
#   "title" => "Chaser", "artist" => "Calibro 35",
#   "album" => "Jazzploitation", "albumArtist" => "Calibro 35", "durationMs" => 182_320
# )
# puts "scrobbled: #{out["scrobbleUri"]}"
# agent.close
