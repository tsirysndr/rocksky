import Config

# Runtime configuration — reads the SAME environment variable names as the
# existing Node API (apps/api) so the two services share one environment:
#   JWT_SECRET, XATA_POSTGRES_URL, REDIS_URL, NATS_URL.
# The listen port is service-specific: REMOTE_WS_PORT (so it never clashes with
# the Node API's PORT).

# JWT signing secret (mirrors apps/api env.JWT_SECRET). Only override when set so
# the test config's fixed secret stays intact.
if secret = System.get_env("JWT_SECRET") do
  config :remote_ws, :jwt_secret, secret
end

# Redis connection URL (mirrors apps/api env.REDIS_URL).
config :remote_ws, :redis_url, System.get_env("REDIS_URL") || "redis://localhost:6379"

# NATS connection URL (mirrors apps/api env.NATS_URL).
config :remote_ws, :nats_url, System.get_env("NATS_URL") || "nats://localhost:4222"

# Postgres (mirrors apps/api env.XATA_POSTGRES_URL).
if database_url = System.get_env("XATA_POSTGRES_URL") do
  config :remote_ws, RemoteWs.Repo,
    url: database_url,
    pool_size: String.to_integer(System.get_env("POOL_SIZE") || "10"),
    ssl: true
end

if config_env() == :prod do
  secret_key_base =
    System.get_env("SECRET_KEY_BASE") ||
      raise "SECRET_KEY_BASE is required in production"

  config :remote_ws, RemoteWsWeb.Endpoint,
    http: [
      ip: {0, 0, 0, 0},
      port: String.to_integer(System.get_env("REMOTE_WS_PORT") || "4000")
    ],
    secret_key_base: secret_key_base,
    server: true
end
