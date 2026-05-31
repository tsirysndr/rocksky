# Free-text search across the catalogue.
#
#   QUERY="nevermind" mix run examples/search.exs

query = System.get_env("QUERY") || "nirvana"

Rocksky.new(base_url: System.get_env("ROCKSKY_BASE_URL", "https://api.rocksky.app"))
|> Rocksky.Feed.search(query: query)
|> case do
  {:ok, results} ->
    IO.puts("Search results for #{inspect(query)}:")
    IO.inspect(results, pretty: true, limit: :infinity)

  {:error, err} ->
    IO.warn("failed: " <> Exception.message(err))
    System.halt(1)
end
