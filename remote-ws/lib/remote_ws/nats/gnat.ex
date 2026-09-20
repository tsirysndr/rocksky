defmodule RemoteWs.Nats.Gnat do
  @moduledoc "Gnat-backed NATS adapter (production)."
  @behaviour RemoteWs.Nats
  require Logger

  @conn RemoteWs.Gnat

  @impl true
  def publish(subject, payload) do
    # A child span of the frame (or the debounce timer) that caused it: this is
    # where the relay's effects leave the process, and the apps/api consumer on
    # the other side is the next thing anyone looks at when a scrobble is
    # missing.
    RemoteWs.Telemetry.span(
      "nats.publish",
      %{
        "messaging.system": "nats",
        "messaging.operation.name": "publish",
        "messaging.destination.name": subject
      },
      fn ->
        try do
          Gnat.pub(@conn, subject, IO.iodata_to_binary(payload))
        catch
          kind, reason ->
            Logger.error("NATS publish failed for #{subject}: #{inspect({kind, reason})}")
        end

        :ok
      end
    )
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
