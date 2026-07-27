defmodule RemoteWsWeb.Router do
  use Phoenix.Router

  pipeline :api do
    plug :accepts, ["json"]
  end

  # The player remote-control relay. A raw-JSON WebSocket (NOT a Phoenix
  # Channel) to stay 1:1 wire-compatible with the existing Node /ws server.
  scope "/", RemoteWsWeb do
    get "/ws", WsController, :upgrade
  end

  scope "/", RemoteWsWeb do
    pipe_through :api
    get "/health", WsController, :health
  end
end
