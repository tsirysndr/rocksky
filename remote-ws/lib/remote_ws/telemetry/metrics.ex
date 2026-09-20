defmodule RemoteWs.Telemetry.Metrics do
  @moduledoc """
  The instruments this service records.

  Named to match the rest of the fleet — crates/telemetry/src/metrics.rs for the
  Rust services, otel/echo.go for the Go ones — so one dashboard covers all of
  Rocksky rather than one per language:

    * `http.server.requests` / `http.server.request.duration` — the small HTTP
      surface (`/health` and the `/ws` upgrade), labelled by *route* rather than
      by path.
    * `rocksky.work.items` / `rocksky.work.duration` — one unit of relay work: an
      inbound frame, a disconnect, a debounced `song.stopped`, a NATS publish.
      `work` names the kind and matches the span name, so a spike in the metric
      leads straight to the traces for it; `outcome` is `ok` or `error`.
    * `rocksky.ws.connections` — how many devices are connected right now, read
      straight off the device registry when the reader collects, so it cannot
      drift the way an incremented/decremented counter does when a connection
      process dies without running `terminate/2`.
    * `erlang.vm.*` — the BEAM equivalent of the runtime metrics the Go services
      ship. Worth having on a process that holds one long-lived Erlang process
      per connected player: memory and process count are where a leaked
      connection shows up first.

  Instrument names are atoms in the Erlang SDK and recording goes through the
  meter by name. The meter itself is a `:persistent_term` read inside
  `:opentelemetry_experimental.get_meter/1`, so there is nothing to cache here.
  """

  require Logger

  # One scope for the whole service, matching the `opentelemetry.meter("rocksky")`
  # the Go and Rust services use.
  @scope_name "rocksky"

  @requests :"http.server.requests"
  @request_duration :"http.server.request.duration"
  @work_items :"rocksky.work.items"
  @work_duration :"rocksky.work.duration"
  @connections :"rocksky.ws.connections"
  @vm_memory :"erlang.vm.memory"
  @vm_processes :"erlang.vm.process.count"
  @vm_run_queue :"erlang.vm.run_queue"

  # The allocation areas worth a series each; `:erlang.memory/0` reports a dozen
  # more that only ever matter when reading a crash dump.
  @memory_areas [:total, :processes, :binary, :ets]

  @doc """
  Creates every instrument. Called once from `RemoteWs.Telemetry.setup/0`, after
  the meter provider has started.
  """
  def setup do
    meter = meter()

    :otel_meter.create_counter(meter, @requests, %{
      description: <<"HTTP requests served">>
    })

    :otel_meter.create_histogram(meter, @request_duration, %{
      description: <<"How long each HTTP request took">>,
      unit: :s
    })

    :otel_meter.create_counter(meter, @work_items, %{
      description: <<"Units of relay work processed">>
    })

    :otel_meter.create_histogram(meter, @work_duration, %{
      description: <<"How long each unit of relay work took">>,
      unit: :s
    })

    :otel_meter.create_observable_gauge(
      meter,
      @connections,
      &__MODULE__.observe_connections/1,
      [],
      %{description: <<"WebSocket devices currently connected">>}
    )

    :otel_meter.create_observable_gauge(
      meter,
      @vm_memory,
      &__MODULE__.observe_memory/1,
      [],
      %{description: <<"BEAM memory in use, by allocation area">>, unit: :By}
    )

    :otel_meter.create_observable_gauge(
      meter,
      @vm_processes,
      &__MODULE__.observe_processes/1,
      [],
      %{description: <<"BEAM processes alive">>}
    )

    :otel_meter.create_observable_gauge(
      meter,
      @vm_run_queue,
      &__MODULE__.observe_run_queue/1,
      [],
      %{description: <<"Processes and ports ready to run but waiting on a scheduler">>}
    )

    :ok
  end

  @doc """
  Records one finished HTTP request against both instruments.

  `route` is the matched Phoenix route (`/ws`, `/health`) rather than the raw
  path, matching what the other services label by.
  """
  def record_request(route, method, status, seconds) do
    attributes = %{
      "http.route": route,
      "http.request.method": method,
      "http.response.status_code": status
    }

    record(@requests, 1, attributes)
    record(@request_duration, seconds, attributes)
  end

  @doc """
  Records one finished unit of relay work. `work` is the kind (`ws.register`,
  `ws.message.track`, …) and `outcome` is `:ok` or `:error` — keep it to that
  handful of values, since every distinct one is a new time series.
  """
  def record_work(work, outcome, seconds) do
    attributes = %{work: work, outcome: outcome}

    record(@work_items, 1, attributes)
    record(@work_duration, seconds, attributes)
  end

  @doc false
  def observe_connections(_args) do
    [{Registry.count(RemoteWs.Devices.Registry), %{}}]
  end

  @doc false
  def observe_memory(_args) do
    memory = :erlang.memory()

    for area <- @memory_areas, value = memory[area] do
      {value, %{"erlang.memory.area": Atom.to_string(area)}}
    end
  end

  @doc false
  def observe_processes(_args), do: [{:erlang.system_info(:process_count), %{}}]

  @doc false
  def observe_run_queue(_args), do: [{:erlang.statistics(:total_run_queue_lengths_all), %{}}]

  # Telemetry must never take the relay down: a meter provider that is not
  # running, or an instrument that failed to be created, returns `false` from
  # `record/5` rather than raising, but a malformed attribute map would not.
  defp record(name, number, attributes) do
    :otel_meter.record(:otel_ctx.get_current(), meter(), name, number, attributes)
  rescue
    error -> Logger.debug("otel: dropped #{name} sample: #{inspect(error)}")
  end

  defp meter do
    :opentelemetry_experimental.get_meter(
      :opentelemetry.instrumentation_scope(@scope_name, <<"0.1.0">>, :undefined)
    )
  end
end
