defmodule RemoteWs.Nats do
  @moduledoc """
  NATS publish surface (mirrors ctx.nc.publish in apps/api). Backed by Gnat in
  production; a collector in test. Dispatches to `:remote_ws, :nats`.
  """

  @callback publish(String.t(), iodata()) :: :ok

  defp impl, do: Application.get_env(:remote_ws, :nats, RemoteWs.Nats.Gnat)

  def publish(subject, payload), do: impl().publish(subject, payload)
end
