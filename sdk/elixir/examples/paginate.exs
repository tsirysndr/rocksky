# Walk through every page of an actor's scrobbles using Stream.unfold.
#
#   ROCKSKY_DID=alice.bsky.social mix run examples/paginate.exs

did = System.get_env("ROCKSKY_DID") || raise "set ROCKSKY_DID"
client = Rocksky.new(base_url: System.get_env("ROCKSKY_BASE_URL", "https://api.rocksky.app"))

page_size = 50

scrobbles_stream =
  Stream.unfold(0, fn offset ->
    case Rocksky.Actor.get_actor_scrobbles(client,
           did: did,
           limit: page_size,
           offset: offset
         ) do
      {:ok, %{"scrobbles" => []}} ->
        nil

      {:ok, %{"scrobbles" => batch}} ->
        {batch, offset + length(batch)}

      {:error, err} ->
        IO.warn("page #{offset}: " <> Exception.message(err))
        nil
    end
  end)
  |> Stream.flat_map(& &1)

count =
  scrobbles_stream
  |> Stream.take(500)
  |> Enum.reduce(0, fn _s, acc -> acc + 1 end)

IO.puts("Walked #{count} scrobbles for #{did}.")
