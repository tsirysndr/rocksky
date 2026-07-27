import Config

# Tests exercise the ported relay logic against in-memory doubles — no live
# Redis, NATS, or Postgres. The externals are not booted and the endpoint does
# not listen.
config :remote_ws,
  redis: RemoteWs.Test.RedisMemory,
  nats: RemoteWs.Test.NatsCollector,
  store: RemoteWs.Test.StoreStub,
  start_externals: false

config :remote_ws, RemoteWsWeb.Endpoint,
  http: [ip: {127, 0, 0, 1}, port: 4002],
  server: false,
  secret_key_base: String.duplicate("test", 30)

# The JWT signing secret used by the token verifier (mirrors env.JWT_SECRET).
config :remote_ws, :jwt_secret, "test-secret"

# Short debounce so song.stopped tests don't wait 15s.
config :remote_ws, :stop_debounce_ms, 30

config :logger, level: :warning
