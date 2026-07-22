# Read-only tour of the native Rocksky core (no auth needed).
#
#   ROCKSKY_ERL_PATH=../erlang mix run examples/native_core.exs
#
# Needs the native lib — build ../erlang/build-core.sh first.
# The write side (login + scrobble) is shown commented at the bottom.

{:ok, stats} = Rocksky.global_stats()
IO.puts("global: #{stats["scrobbles"]} scrobbles · #{stats["users"]} users · #{stats["tracks"]} tracks")

IO.puts("top tracks:")

{:ok, top} = Rocksky.top_tracks(5, 0)

for t <- top do
  IO.puts("  #{t["artist"]} — #{t["title"]}")
end

IO.puts("song hash: #{Rocksky.song_hash("Chaser", "Calibro 35", "Jazzploitation")}")

# --- write side (uncomment with real credentials) ---
# agent = Rocksky.login("session.json", "alice.bsky.social", "app-pw")
# {:ok, out} = Rocksky.scrobble(agent, %{
#   "title" => "Chaser", "artist" => "Calibro 35",
#   "album" => "Jazzploitation", "albumArtist" => "Calibro 35", "durationMs" => 182_320
# })
# IO.puts("scrobbled: #{out["scrobbleUri"]}")
