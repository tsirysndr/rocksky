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
  start_externals: true,
  # Whether to install the OTLP logger handler. Disabled in test, where there is
  # no collector to ship to. See lib/remote_ws/telemetry.ex.
  otlp_logs: true

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

# OpenTelemetry. The name this process reports itself as; OTEL_SERVICE_NAME wins
# over it when set, which is how the SDK's resource detector is meant to be
# overridden. The endpoint and the per-signal exporters are environment, so they
# live in config/runtime.exs.
#
# This one map is the identity on *all three* signals, not just the traces:
# `otel_resource_detector:get_resource/0` is what the tracer, the metric reader
# and `otel_log_handler` each read on the way up, which is what lets a backend
# show a span, the metric point it contributed to and the line it logged as one
# process. The namespace is shared with every other Rocksky service, so a query
# can say "all of Rocksky" without naming them. `service.instance.id` is per
# boot and so lives in config/runtime.exs.
config :opentelemetry,
  span_processor: :batch,
  traces_exporter: :otlp,
  resource: %{
    service: %{
      name: "remote-ws",
      version: Mix.Project.config()[:version],
      namespace: "rocksky"
    }
  }

import_config "#{config_env()}.exs"
