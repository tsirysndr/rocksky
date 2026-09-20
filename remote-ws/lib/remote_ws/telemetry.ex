defmodule RemoteWs.Telemetry do
  @moduledoc """
  OpenTelemetry for the relay: traces, metrics and logs over OTLP.

  Mirrors what the Rust services get from `rocksky-telemetry`, the Go ones from
  `otel/` and the Node ones from `apps/api/src/otel.ts` — the same collector
  (`OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`) and the same
  instrument names, so all of Rocksky lands in one set of charts.

  ## Why three application environments

  Traces are a stable signal in the Erlang SDK and configure under
  `:opentelemetry` / `:opentelemetry_exporter`. Metrics and logs are not: the
  meter provider, `otel_metric_reader` and the `otel_log_handler` logger handler
  all live in `:opentelemetry_experimental`, and their OTLP exporters read the
  endpoint out of *that* application's environment. That is why
  config/runtime.exs sets the same endpoint under two keys rather than one.

  ## What is instrumented

    * HTTP — Bandit and Phoenix, so `/health` and the `/ws` upgrade each get a
      span. The upgrade's span ends at the 101; it does not stay open for the
      life of the socket.
    * Postgres and Redis — every `Ecto` query and `Redix` command, as children
      of whatever relay span was open.
    * The relay itself — one span per inbound frame (`RemoteWs.Ws.Handler`), one
      per disconnect, one per debounced `song.stopped`, and one per NATS
      publish.

  Logs keep going through `Logger`; the handler installed here ships a copy to
  the collector stamped with the trace and span id of whatever span was open
  when the line was written, so a log line links back to the frame that produced
  it.
  """

  require Logger
  require OpenTelemetry.Tracer

  alias RemoteWs.Telemetry.Metrics

  @doc """
  Attaches every instrumentation handler and installs the log handler. Called
  once from `RemoteWs.Application.start/2`, before the endpoint starts listening.
  """
  def setup do
    OpentelemetryBandit.setup()
    OpentelemetryPhoenix.setup(adapter: :bandit, liveview: false)
    OpentelemetryEcto.setup([:remote_ws, :repo])
    OpentelemetryRedix.setup()

    Metrics.setup()
    attach_http_metrics()

    if Application.get_env(:remote_ws, :otlp_logs, true), do: install_log_handler()

    :ok
  end

  @doc """
  Runs `fun` as one unit of relay work: a root span named `name`, plus a sample
  on `rocksky.work.items` / `rocksky.work.duration` tagged with the same name.

  A root span rather than a child, because a frame arrives on a socket that was
  established long ago: there is no incoming `traceparent` to continue. The
  context is cleared first — the connection process is the same one that served
  the HTTP upgrade, and whatever it left behind would otherwise parent every
  frame for the life of the socket onto one enormous trace.
  """
  def work(name, attributes, fun) do
    :otel_ctx.clear()
    started = System.monotonic_time()

    OpenTelemetry.Tracer.with_span name, %{attributes: attributes} do
      try do
        result = fun.()
        Metrics.record_work(name, "ok", elapsed_seconds(started))
        result
      catch
        kind, reason ->
          fail(kind, reason)
          Metrics.record_work(name, "error", elapsed_seconds(started))
          :erlang.raise(kind, reason, __STACKTRACE__)
      end
    end
  end

  @doc """
  Runs `fun` inside a child span of whatever is currently open — for the
  outward effects (a NATS publish) that hang off a unit of work rather than
  being one.
  """
  def span(name, attributes, fun) do
    OpenTelemetry.Tracer.with_span name, %{attributes: attributes} do
      try do
        fun.()
      catch
        kind, reason ->
          fail(kind, reason)
          :erlang.raise(kind, reason, __STACKTRACE__)
      end
    end
  end

  defp fail(kind, reason) do
    OpenTelemetry.Tracer.set_status(OpenTelemetry.status(:error, "#{kind}: #{inspect(reason)}"))
  end

  defp elapsed_seconds(started) do
    System.convert_time_unit(System.monotonic_time() - started, :native, :nanosecond) /
      1_000_000_000
  end

  # ── HTTP metrics ────────────────────────────────────────────────────────────
  #
  # Off Bandit's events rather than Phoenix's: `Plug.Telemetry`'s `:stop` fires
  # from a `before_send` hook, and the `/ws` upgrade never sends a response
  # through one — so measuring there would report on `/health` and nothing else.

  defp attach_http_metrics do
    :telemetry.attach_many(
      {__MODULE__, :http_metrics},
      [[:bandit, :request, :stop], [:bandit, :request, :exception]],
      &__MODULE__.handle_http_event/4,
      :no_config
    )
  end

  @doc false
  def handle_http_event([:bandit, :request, :stop], measurements, %{conn: conn}, _config) do
    record_request(conn, conn.status || 200, measurements)
  end

  def handle_http_event([:bandit, :request, :exception], measurements, meta, _config) do
    case meta do
      %{conn: conn} -> record_request(conn, 500, measurements)
      _ -> :ok
    end
  end

  def handle_http_event(_event, _measurements, _meta, _config), do: :ok

  defp record_request(conn, status, measurements) do
    seconds =
      System.convert_time_unit(measurements[:duration] || 0, :native, :nanosecond) / 1_000_000_000

    Metrics.record_request(route(conn), conn.method, status, seconds)
  end

  # By route, not by path: this service only serves `/ws` and `/health` today,
  # but labelling by the raw path is how a metric quietly grows a time series
  # per URL the day something else is mounted here.
  defp route(conn) do
    case Phoenix.Router.route_info(RemoteWsWeb.Router, conn.method, conn.request_path, conn.host) do
      %{route: route} -> route
      _ -> "unmatched"
    end
  end

  # ── logs ────────────────────────────────────────────────────────────────────

  defp install_log_handler do
    config = %{
      level: :info,
      filter_default: :log,
      filters: [otel_internal: {&__MODULE__.drop_otel_internal/2, []}],
      exporter: {:otel_exporter_logs_otlp, %{}}
    }

    case :logger.add_handler(:otel_log_handler, :otel_log_handler, config) do
      :ok -> :ok
      {:error, {:already_exist, _}} -> :ok
      {:error, reason} -> Logger.error("otel: log exporter disabled: #{inspect(reason)}")
    end
  end

  @doc false
  # The SDK logs its own export failures. Shipping those to the collector is how
  # a collector that is refusing everything turns into a loop that generates
  # more of exactly what it cannot deliver, so they stay on the console only.
  def drop_otel_internal(%{meta: %{mfa: {module, _function, _arity}}} = event, _extra) do
    if otel_module?(module), do: :stop, else: event
  end

  def drop_otel_internal(event, _extra), do: event

  defp otel_module?(module) do
    name = Atom.to_string(module)
    String.starts_with?(name, "otel_") or String.starts_with?(name, "opentelemetry")
  end
end
