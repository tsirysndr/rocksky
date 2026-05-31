defmodule Rocksky.HTTP do
  @moduledoc """
  Low-level XRPC transport. Most users should call the namespace modules
  (`Rocksky.Actor`, `Rocksky.Scrobble`, etc.) instead.

  All XRPC endpoints live under `/xrpc/<nsid>`. Queries are `GET` with query
  parameters; procedures are `POST` with a JSON body.
  """

  alias Rocksky.{Client, Error}

  @type nsid :: String.t()
  @type params :: keyword() | map()

  @doc """
  Issue a query (GET) against `nsid` with the given params.
  """
  @spec query(Client.t(), nsid(), params()) :: {:ok, term()} | {:error, Error.t()}
  def query(%Client{} = client, nsid, params \\ []) do
    request(client,
      method: :get,
      nsid: nsid,
      params: encode_params(params)
    )
  end

  @doc """
  Issue a procedure (POST) against `nsid`.

  `body` is encoded as JSON. `params` are sent as query string parameters
  (some lexicons declare both, e.g. `app.rocksky.player.next`).
  """
  @spec procedure(Client.t(), nsid(), params(), term()) ::
          {:ok, term()} | {:error, Error.t()}
  def procedure(%Client{} = client, nsid, params \\ [], body \\ nil) do
    request(client,
      method: :post,
      nsid: nsid,
      params: encode_params(params),
      body: body
    )
  end

  defp request(%Client{} = client, opts) do
    nsid = Keyword.fetch!(opts, :nsid)
    method = Keyword.fetch!(opts, :method)
    url = client.base_url <> "/xrpc/" <> nsid

    req_opts =
      [
        method: method,
        url: url,
        headers: build_headers(client),
        params: Keyword.get(opts, :params, []),
        decode_json: [keys: :strings],
        retry: :safe_transient
      ]
      |> maybe_put_body(Keyword.get(opts, :body))
      |> Keyword.merge(client.req_options)

    case Req.request(req_opts) do
      {:ok, %Req.Response{status: status, body: body}} when status in 200..299 ->
        {:ok, body}

      {:ok, %Req.Response{status: status, body: body}} ->
        {:error, Error.from_status(status, body)}

      {:error, reason} ->
        {:error, Error.from_transport(reason)}
    end
  end

  defp maybe_put_body(opts, nil), do: opts
  defp maybe_put_body(opts, body), do: Keyword.put(opts, :json, body)

  defp build_headers(%Client{token: nil, headers: extra}) do
    [{"accept", "application/json"} | extra]
  end

  defp build_headers(%Client{token: token, headers: extra}) do
    [
      {"authorization", "Bearer " <> token},
      {"accept", "application/json"}
      | extra
    ]
  end

  @doc false
  # Drop nil values, convert atom keys to strings, leave the rest to Req's encoder.
  def encode_params(params) when is_list(params) or is_map(params) do
    params
    |> Enum.reject(fn {_k, v} -> is_nil(v) end)
    |> Enum.map(fn {k, v} -> {to_string(k), encode_value(v)} end)
  end

  defp encode_value(v) when is_list(v), do: Enum.join(v, ",")
  defp encode_value(v), do: v
end
