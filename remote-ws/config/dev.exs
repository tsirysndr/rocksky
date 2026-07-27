import Config

config :remote_ws, RemoteWsWeb.Endpoint,
  # Bind on all interfaces in dev; the port comes from runtime.exs (PORT).
  http: [ip: {0, 0, 0, 0}, port: String.to_integer(System.get_env("REMOTE_WS_PORT") || "4000")],
  server: true,
  debug_errors: true,
  check_origin: false,
  secret_key_base: String.duplicate("dev", 30)

config :logger, level: :debug
