import Config

# Compile-time configuration shared by all environments. Environment-specific
# values (secrets, URLs) are read at runtime — see config/runtime.exs.

config :remote_ws,
  ecto_repos: [RemoteWs.Repo],
  # Pluggable side-effect adapters — swapped for in-memory doubles in test so the
  # relay logic (enrichment, gating, debounce) is unit-testable without live
  # Redis / NATS / Postgres. See config/test.exs.
  redis: RemoteWs.Redis.Redix,
  nats: RemoteWs.Nats.Gnat,
  store: RemoteWs.Store.Ecto,
  # Whether to boot the external clients (Repo, Redix, NATS) in the supervision
  # tree. Disabled in test.
  start_externals: true

# The raw-JSON WebSocket relay is served by a Bandit-backed Phoenix endpoint.
config :remote_ws, RemoteWsWeb.Endpoint,
  adapter: Bandit.PhoenixAdapter,
  url: [host: "localhost"],
  render_errors: [formats: [json: RemoteWsWeb.ErrorJSON], layout: false],
  pubsub_server: RemoteWs.PubSub

config :phoenix, :json_library, Jason

config :logger, :console,
  format: "$time $metadata[$level] $message\n",
  metadata: [:request_id, :did]

import_config "#{config_env()}.exs"
