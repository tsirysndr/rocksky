# Fetch a public Rocksky profile.
#
#   ROCKSKY_DID=alice.bsky.social mix run examples/get_profile.exs

did = System.get_env("ROCKSKY_DID") || raise "set ROCKSKY_DID"

client =
  Rocksky.new(
    base_url: System.get_env("ROCKSKY_BASE_URL", "https://api.rocksky.app"),
    token: System.get_env("ROCKSKY_TOKEN")
  )

case Rocksky.Actor.get_profile(client, did: did) do
  {:ok, profile} ->
    IO.puts("Profile for #{did}:")
    IO.inspect(profile, pretty: true, limit: :infinity)

  {:error, err} ->
    IO.warn("failed: " <> Exception.message(err))
    System.halt(1)
end
