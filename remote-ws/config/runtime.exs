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

# ── OpenTelemetry ─────────────────────────────────────────────────────────────
# The standard environment, the same one the Go and Node services read:
# OTEL_EXPORTER_OTLP_ENDPOINT (the local collector by default) and
# OTEL_EXPORTER_OTLP_HEADERS for its ingest token. Headers are left entirely to
# the environment — the SDK parses OTEL_EXPORTER_OTLP_HEADERS itself — so a
# process run under doppler needs nothing extra here.
#
# The endpoint is set twice on purpose: traces read it from
# :opentelemetry_exporter, while the metric and log exporters (still the
# "experimental" SDK in Erlang) read it from :opentelemetry_experimental.
if config_env() != :test do
  otlp_endpoint = System.get_env("OTEL_EXPORTER_OTLP_ENDPOINT") || "http://127.0.0.1:4318"

  config :opentelemetry_exporter,
    otlp_protocol: :http_protobuf,
    otlp_endpoint: otlp_endpoint

  config :opentelemetry_experimental,
    otlp_protocol: :http_protobuf,
    otlp_endpoint: otlp_endpoint,
    readers: [
      %{
        module: :otel_metric_reader,
        config: %{
          exporter: {:otel_exporter_metrics_otlp, %{}},
          # Matches the 10s period the Rust, Go and Node services export on.
          export_interval_ms: 10_000
        }
      }
    ]
end

if config_env() == :prod do
  # This service is a raw-WebSocket relay — no cookies, sessions, CSRF, or
  # LiveView — so it never actually uses secret_key_base. Phoenix only requires
  # one to be present to boot, so we generate a random value per boot. There is
  # no SECRET_KEY_BASE env var to set, and nothing signed needs to survive a
  # restart.
  config :remote_ws, RemoteWsWeb.Endpoint,
    http: [
      ip: {0, 0, 0, 0},
      port: String.to_integer(System.get_env("REMOTE_WS_PORT") || "4000")
    ],
    secret_key_base: Base.encode64(:crypto.strong_rand_bytes(48)),
    server: true
end
