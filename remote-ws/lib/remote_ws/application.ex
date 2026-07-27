defmodule RemoteWs.Application do
  @moduledoc false
  use Application

  @impl true
  def start(_type, _args) do
    children =
      [
        # PubSub is referenced by the Phoenix endpoint config.
        {Phoenix.PubSub, name: RemoteWs.PubSub},
        # Tracks connected devices per user (did) — replaces the Node handler's
        # module-level `devices` / `deviceNames` / `userDevices` maps. Entries
        # are owned by each connection process, so they auto-clean on disconnect.
        {Registry, keys: :duplicate, name: RemoteWs.Devices.Registry},
        # Debounced song.stopped timers — replaces the `pendingStop` map.
        RemoteWs.StopDebouncer,
        RemoteWsWeb.Endpoint
      ] ++ external_children()

    opts = [strategy: :one_for_one, name: RemoteWs.Supervisor]
    Supervisor.start_link(children, opts)
  end

  @impl true
  def config_change(changed, _new, removed) do
    RemoteWsWeb.Endpoint.config_change(changed, removed)
    :ok
  end

  # Repo, Redis and NATS clients are only booted when configured (never in test,
  # where in-memory doubles are used instead).
  defp external_children do
    if Application.get_env(:remote_ws, :start_externals, true) do
      [RemoteWs.Repo, redis_child(), nats_child()]
      |> Enum.reject(&is_nil/1)
    else
      []
    end
  end

  defp redis_child do
    url = Application.get_env(:remote_ws, :redis_url, "redis://localhost:6379")
    {Redix, {url, [name: RemoteWs.Redix]}}
  end

  defp nats_child do
    %{host: host, port: port} =
      RemoteWs.Nats.Gnat.parse_url(Application.get_env(:remote_ws, :nats_url))

    %{
      id: :gnat_conn,
      start:
        {Gnat.ConnectionSupervisor, :start_link,
         [
           %{
             name: RemoteWs.Gnat,
             connection_settings: [%{host: host, port: port}]
           }
         ]}
    }
  end
end
