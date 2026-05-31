# Show top tracks for the year so far.
#
#   mix run examples/charts.exs

client = Rocksky.new(base_url: System.get_env("ROCKSKY_BASE_URL", "https://api.rocksky.app"))

start_date = "#{Date.utc_today().year}-01-01"

case Rocksky.Charts.get_top_tracks(client, limit: 10, startDate: start_date) do
  {:ok, %{"tracks" => tracks}} ->
    IO.puts("Top tracks since #{start_date}:\n")

    tracks
    |> Enum.with_index(1)
    |> Enum.each(fn {t, i} ->
      IO.puts(
        "  #{String.pad_leading(to_string(i), 2)}. " <>
          "#{t["artist"]} — #{t["title"]} (#{t["playCount"]} plays)"
      )
    end)

  {:ok, other} ->
    IO.inspect(other, label: "unexpected response")

  {:error, err} ->
    IO.warn("failed: " <> Exception.message(err))
    System.halt(1)
end
