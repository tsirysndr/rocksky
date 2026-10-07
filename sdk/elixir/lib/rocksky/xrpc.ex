defmodule Rocksky.Xrpc do
  @moduledoc "Raw XRPC transport; generated typed endpoint functions live in Rocksky.Api."
  defstruct endpoint: "https://api.rocksky.app", token: nil, timeout: 30_000
  @type t :: %__MODULE__{endpoint: String.t(), token: String.t() | nil, timeout: pos_integer()}
  @type response :: %{status: integer(), headers: list(), body: binary()}
  @spec new(keyword()) :: t()
  def new(options \\ []), do: struct!(__MODULE__, options)

  @doc "Preserves HTTP status and raw response bytes. Params and body are independent."
  @spec raw(t(), :get | :post, String.t(), map(), Rocksky.Codec.json_value()) ::
          {:ok, response()} | {:error, term()}
  def raw(client, method, nsid, params \\ %{}, body \\ nil) when method in [:get, :post] do
    if not Regex.match?(~r/^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+$/, nsid),
      do: raise(ArgumentError, "Invalid XRPC NSID")

    pairs =
      Enum.flat_map(params, fn {key, value} ->
        Enum.flat_map(if(is_list(value), do: value, else: [value]), fn
          nil -> []
          v when is_binary(v) or is_number(v) or is_boolean(v) -> [{key, to_string(v)}]
          _ -> raise ArgumentError, "Invalid query parameter: #{key}"
        end)
      end)

    query = URI.encode_query(pairs)

    url =
      String.trim_trailing(client.endpoint, "/") <>
        "/xrpc/" <> nsid <> if(query == "", do: "", else: "?" <> query)

    headers = [
      {~c"accept", ~c"application/json"},
      {~c"user-agent", ~c"Rocksky-Elixir/typed-xrpc"}
    ]

    headers =
      if client.token,
        do: [{~c"authorization", String.to_charlist("Bearer " <> client.token)} | headers],
        else: headers

    request =
      case method do
        :get ->
          {String.to_charlist(url), headers}

        :post ->
          {String.to_charlist(url), headers, ~c"application/json",
           if(is_nil(body),
             do: "",
             else: :json.encode(Rocksky.Codec.to_wire(body)) |> IO.iodata_to_binary()
           )}
      end

    with {:ok, _} <- Application.ensure_all_started(:inets),
         {:ok, _} <- Application.ensure_all_started(:ssl) do
      ssl = [
        verify: :verify_peer,
        cacerts: :public_key.cacerts_get(),
        customize_hostname_check: [match_fun: :public_key.pkix_verify_hostname_match_fun(:https)]
      ]

      case :httpc.request(
             method,
             request,
             [
               timeout: client.timeout,
               connect_timeout: client.timeout,
               autoredirect: false,
               ssl: ssl
             ], body_format: :binary) do
        {:ok, {{_, status, _}, response_headers, bytes}} ->
          {:ok, %{status: status, headers: response_headers, body: bytes}}

        {:error, reason} ->
          {:error, {:transport, reason}}
      end
    end
  end

  @doc false
  def request(client, method, nsid, params, body, output) do
    case raw(client, method, nsid, params, body) do
      {:ok, %{status: status, body: bytes}} when status >= 200 and status < 300 ->
        try do
          case output do
            :binary ->
              {:ok, bytes}

            :none ->
              {:ok, nil}

            _ ->
              {:ok,
               Rocksky.Codec.decode_value(
                 output,
                 :json.decode(bytes) |> Rocksky.Codec.from_wire()
               )}
          end
        rescue
          error -> {:error, {:decode, Exception.message(error)}}
        end

      {:ok, response} ->
        {:error, {:http, response.status, response.body}}

      error ->
        error
    end
  end
end
