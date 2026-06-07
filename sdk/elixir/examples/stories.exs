# Latest scrobble per user, optionally filtered by feed generator or
# restricted to people the viewer follows.
#
#   mix run examples/stories.exs
#   MODE=metalcore mix run examples/stories.exs
#   ROCKSKY_TOKEN=… MODE=following mix run examples/stories.exs

feeds = %{
  "metalcore" => "at://did:plc:vegqomyce4ssoqs7zwqvgqty/app.rocksky.feed.generator/metalcore",
  "trap" => "at://did:plc:vegqomyce4ssoqs7zwqvgqty/app.rocksky.feed.generator/trap",
  "synthwave" => "at://did:plc:vegqomyce4ssoqs7zwqvgqty/app.rocksky.feed.generator/synthwave"
}

mode = System.get_env("MODE")
token = System.get_env("ROCKSKY_TOKEN")

opts =
  [base_url: System.get_env("ROCKSKY_BASE_URL", "https://api.rocksky.app")]
  |> then(fn o -> if token, do: Keyword.put(o, :token, token), else: o end)

params =
  cond do
    Map.has_key?(feeds, mode) -> [size: 10, feed: Map.fetch!(feeds, mode)]
    mode == "following" -> [size: 10, following: true]
    true -> [size: 10]
  end

case Rocksky.new(opts) |> Rocksky.Feed.get_stories(params) do
  {:ok, %{"stories" => stories}} ->
    Enum.each(stories, fn s ->
      IO.puts("@#{s["handle"]}  #{s["artist"]} — #{s["title"]}")
    end)

    IO.puts("\n#{length(stories)} stories")

  {:error, err} ->
    IO.warn("failed: " <> Exception.message(err))
    System.halt(1)
end
