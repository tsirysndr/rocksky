defmodule RemoteWs.TelemetryTest do
  use RemoteWs.Test.Case
  require Record

  alias RemoteWs.{Telemetry, Ws.Handler}

  Record.defrecordp(
    :span,
    Record.extract(:span, from_lib: "opentelemetry/include/otel_span.hrl")
  )

  setup do
    # The simple processor exports each span as it ends, so they arrive here as
    # `{:span, record}` messages. Left pointed at the (by then dead) test process
    # afterwards rather than reset: the only way to unset an exporter is to hand
    # the processor a module that does not exist, which it complains about.
    :otel_simple_processor.set_exporter(:otel_exporter_pid, self())
    :ok
  end

  defp next_span do
    receive do
      {:span, record} -> record
    after
      1_000 -> flunk("no span was exported")
    end
  end

  test "every inbound frame is named after what it does" do
    did = "did:plc:#{System.unique_integer([:positive])}"
    token = Token.sign(%{"did" => did})

    {_frames, state} =
      Handler.handle(
        %{"type" => "register", "clientName" => "Rocksky CLI", "token" => token},
        %{device_id: nil, did: nil}
      )

    assert span(next_span(), :name) == "ws.register"

    Handler.handle(
      %{
        "type" => "message",
        "token" => token,
        "data" => %{"type" => "track", "title" => "t", "artist" => "a", "album" => "b"}
      },
      state
    )

    assert span(next_span(), :name) == "ws.message.track"

    Handler.handle(%{"type" => "command", "action" => "play", "token" => token}, state)
    assert span(next_span(), :name) == "ws.command"

    # A `data.type` the relay does not know is handled as a status push, so it
    # is labelled as one rather than becoming a series of its own.
    Handler.handle(%{"type" => "message", "token" => token, "data" => %{"type" => "🌶"}}, state)
    assert span(next_span(), :name) == "ws.message.status"

    Handler.handle(%{"type" => "nonsense"}, state)
    assert span(next_span(), :name) == "ws.unknown"
  end

  test "frames on one socket are separate traces, not one that grows forever" do
    did = "did:plc:#{System.unique_integer([:positive])}"
    token = Token.sign(%{"did" => did})
    state = %{device_id: "device", did: did}

    Handler.handle(%{"type" => "command", "action" => "play", "token" => token}, state)
    first = next_span()

    Handler.handle(%{"type" => "command", "action" => "pause", "token" => token}, state)
    second = next_span()

    assert span(first, :parent_span_id) == :undefined
    assert span(second, :parent_span_id) == :undefined
    refute span(first, :trace_id) == span(second, :trace_id)
  end

  test "a failing frame is marked on its span and re-raised unchanged" do
    assert_raise RuntimeError, "boom", fn ->
      Telemetry.work("ws.boom", %{}, fn -> raise "boom" end)
    end

    assert {:status, :error, _message} = span(next_span(), :status)
  end

  test "the SDK's own log lines never reach the log exporter" do
    otel_event = %{meta: %{mfa: {:otel_exporter_traces_otlp, :export, 3}}}
    app_event = %{meta: %{mfa: {RemoteWs.Ws.Handler, :handle, 2}}}

    assert Telemetry.drop_otel_internal(otel_event, []) == :stop
    assert Telemetry.drop_otel_internal(app_event, []) == app_event
    assert Telemetry.drop_otel_internal(%{meta: %{}}, []) == %{meta: %{}}
  end
end
