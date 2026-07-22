# Read-only tour of the native Rocksky core (no auth needed).
#
#   ROCKSKY_ERL_PATH=../erlang mix run examples/native_core.exs
#
# Needs the native lib — build ../erlang/build-core.sh first.
# The write side (login + scrobble) is shown commented at the bottom.

{:ok, stats} = Rocksky.Core.global_stats()
IO.puts("global: #{stats["scrobbles"]} scrobbles · #{stats["users"]} users · #{stats["tracks"]} tracks")

IO.puts("top tracks:")

{:ok, top} = Rocksky.Core.top_tracks(5, 0)

for t <- top do
  IO.puts("  #{t["artist"]} — #{t["title"]}")
end

IO.puts("song hash: #{Rocksky.Core.song_hash("Chaser", "Calibro 35", "Jazzploitation")}")

# --- write side (uncomment with real credentials) ---
# agent = Rocksky.Core.login("session.json", "alice.bsky.social", "app-pw")
# {:ok, out} = Rocksky.Core.scrobble(agent, %{
#   "title" => "Chaser", "artist" => "Calibro 35",
#   "album" => "Jazzploitation", "albumArtist" => "Calibro 35", "durationMs" => 182_320
# })
# IO.puts("scrobbled: #{out["scrobbleUri"]}")
