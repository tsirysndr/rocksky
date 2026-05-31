defmodule Rocksky.Error do
  @moduledoc """
  Error returned from any Rocksky SDK call.

  * `:status` — HTTP status (nil for transport errors)
  * `:reason` — atom or term describing the failure
  * `:message` — human-readable message
  * `:body` — response body if present (parsed JSON or raw string)
  """

  defexception [:status, :reason, :message, :body]

  @type t :: %__MODULE__{
          status: pos_integer() | nil,
          reason: atom() | term(),
          message: String.t(),
          body: term()
        }

  @impl true
  def message(%__MODULE__{message: message, status: nil}), do: message

  def message(%__MODULE__{message: message, status: status}) do
    "(HTTP #{status}) #{message}"
  end

  @doc false
  def from_status(status, body) do
    reason =
      case status do
        400 -> :bad_request
        401 -> :unauthorized
        403 -> :forbidden
        404 -> :not_found
        429 -> :rate_limited
        s when s in 500..599 -> :server_error
        _ -> :http_error
      end

    %__MODULE__{
      status: status,
      reason: reason,
      message: extract_message(body) || "request failed",
      body: body
    }
  end

  @doc false
  def from_transport(reason) do
    %__MODULE__{
      status: nil,
      reason: :transport_error,
      message: "transport error: #{inspect(reason)}",
      body: nil
    }
  end

  defp extract_message(%{"message" => msg}) when is_binary(msg), do: msg
  defp extract_message(%{"error" => msg}) when is_binary(msg), do: msg
  defp extract_message(msg) when is_binary(msg), do: msg
  defp extract_message(_), do: nil
end
