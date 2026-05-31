defmodule Rocksky.Client do
  @moduledoc """
  Client struct holding base URL, token and request options.

  Build one with `Rocksky.new/1`.
  """

  @default_base_url "https://api.rocksky.app"

  @type t :: %__MODULE__{
          base_url: String.t(),
          token: String.t() | nil,
          headers: list({String.t(), String.t()}),
          req_options: keyword()
        }

  defstruct base_url: @default_base_url,
            token: nil,
            headers: [],
            req_options: []

  @spec new(keyword()) :: t()
  def new(opts \\ []) do
    base_url =
      opts[:base_url] ||
        Application.get_env(:rocksky, :base_url, @default_base_url)

    req_options =
      opts[:req_options] ||
        Application.get_env(:rocksky, :req_options, [])

    %__MODULE__{
      base_url: normalize_base_url(base_url),
      token: opts[:token],
      headers: opts[:headers] || [],
      req_options: req_options
    }
  end

  @doc """
  Return a new client with the given Bearer token. Useful when you want to derive
  authenticated clients from a shared base.

      client |> Rocksky.Client.with_token(token)
  """
  @spec with_token(t(), String.t() | nil) :: t()
  def with_token(%__MODULE__{} = client, token), do: %{client | token: token}

  defp normalize_base_url(url) when is_binary(url) do
    String.trim_trailing(url, "/")
  end
end
