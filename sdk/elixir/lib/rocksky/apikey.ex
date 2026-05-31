defmodule Rocksky.Apikey do
  @moduledoc "`app.rocksky.apikey.*` endpoints. All require an authenticated client."

  alias Rocksky.HTTP

  @doc "List your API keys. Params: `:limit`, `:offset`."
  def get_apikeys(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.apikey.getApikeys", params)

  @doc "Create a new API key. Body: `:name`, `:description`."
  def create_apikey(client, body) when is_list(body) or is_map(body),
    do: HTTP.procedure(client, "app.rocksky.apikey.createApikey", [], Map.new(body))

  @doc "Update an API key. Body: `:id`, `:name`, `:description`."
  def update_apikey(client, body) when is_list(body) or is_map(body),
    do: HTTP.procedure(client, "app.rocksky.apikey.updateApikey", [], Map.new(body))

  @doc "Remove an API key. Params: `:id`."
  def remove_apikey(client, params),
    do: HTTP.procedure(client, "app.rocksky.apikey.removeApikey", params)
end
