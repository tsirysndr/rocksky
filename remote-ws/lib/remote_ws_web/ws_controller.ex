defmodule RemoteWsWeb.WsController do
  use Phoenix.Controller, formats: [:json]

  # Upgrade the HTTP request to a WebSocket handled by RemoteWs.Ws.Connection.
  # Mirrors Hono's `upgradeWebSocket(handleWebsocket)` mounted at GET /ws.
  def upgrade(conn, _params) do
    conn
    |> WebSockAdapter.upgrade(RemoteWs.Ws.Connection, %{}, timeout: 60_000)
    |> halt()
  end

  def health(conn, _params) do
    json(conn, %{status: "ok"})
  end
end
