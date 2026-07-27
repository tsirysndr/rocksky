defmodule RemoteWs.Nats.Gnat do
  @moduledoc "Gnat-backed NATS adapter (production)."
  @behaviour RemoteWs.Nats
  require Logger

  @conn RemoteWs.Gnat

  @impl true
  def publish(subject, payload) do
    try do
      Gnat.pub(@conn, subject, IO.iodata_to_binary(payload))
    catch
      kind, reason ->
        Logger.error("NATS publish failed for #{subject}: #{inspect({kind, reason})}")
    end

    :ok
  end

  @doc """
  Parse a `nats://host:port` URL into the shape Gnat's connection settings want.
  """
  def parse_url(url) when is_binary(url) do
    uri = URI.parse(url)
    %{host: uri.host || "localhost", port: uri.port || 4222}
  end

  def parse_url(_), do: %{host: "localhost", port: 4222}
end
