import Config

# Tests exercise the ported relay logic against in-memory doubles — no live
# Redis, NATS, or Postgres. The externals are not booted and the endpoint does
# not listen.
config :remote_ws,
  redis: RemoteWs.Test.RedisMemory,
  nats: RemoteWs.Test.NatsCollector,
  store: RemoteWs.Test.StoreStub,
  start_externals: false,
  otlp_logs: false

# Spans and samples are still produced in test — the instrumentation is part of
# what the relay does — but nothing leaves the node: no trace exporter, and no
# metric reader to collect for. The simple (unbatched) processor is what lets a
# test point the exporter at itself and see spans as they end; see
# test/remote_ws/telemetry_test.exs.
config :opentelemetry, span_processor: :simple, traces_exporter: :none
config :opentelemetry_experimental, readers: []

config :remote_ws, RemoteWsWeb.Endpoint,
  http: [ip: {127, 0, 0, 1}, port: 4002],
  server: false,
  secret_key_base: String.duplicate("test", 30)

# The JWT signing secret used by the token verifier (mirrors env.JWT_SECRET).
config :remote_ws, :jwt_secret, "test-secret"

# Short debounce so song.stopped tests don't wait 15s.
config :remote_ws, :stop_debounce_ms, 30

config :logger, level: :warning
