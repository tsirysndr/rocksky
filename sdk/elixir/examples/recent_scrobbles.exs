# Print the 10 most recent scrobbles for an actor.
#
#   ROCKSKY_DID=alice.bsky.social mix run examples/recent_scrobbles.exs

did = System.get_env("ROCKSKY_DID") || raise "set ROCKSKY_DID"

Rocksky.new(base_url: System.get_env("ROCKSKY_BASE_URL", "https://api.rocksky.app"))
|> Rocksky.Actor.get_actor_scrobbles(did: did, limit: 10)
|> case do
  {:ok, %{"scrobbles" => scrobbles}} ->
    IO.puts("Last #{length(scrobbles)} scrobbles for #{did}:\n")

    for s <- scrobbles do
      IO.puts("  #{s["createdAt"]}  #{s["artist"]} — #{s["title"]}")
    end

  {:ok, other} ->
    IO.inspect(other, label: "unexpected response")

  {:error, err} ->
    IO.warn("failed: " <> Exception.message(err))
    System.halt(1)
end
