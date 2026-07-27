defmodule RemoteWsWeb.Endpoint do
  use Phoenix.Endpoint, otp_app: :remote_ws

  plug Plug.RequestId
  plug Plug.Telemetry, event_prefix: [:phoenix, :endpoint]

  plug Plug.Parsers,
    parsers: [:json],
    pass: ["*/*"],
    json_decoder: Phoenix.json_library()

  plug RemoteWsWeb.Router
end
