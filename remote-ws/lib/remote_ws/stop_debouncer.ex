defmodule RemoteWs.StopDebouncer do
  @moduledoc """
  Debounces `rocksky.song.stopped` by DID — a port of the Node handler's
  `pendingStop` map. A status=0 schedules a fire after `stop_debounce_ms` (15s by
  default). A status=1 (or a track change) within the window cancels it, so a
  paused player oscillating status 0/1 doesn't produce a PDS delete→create loop.

  When a timer fires it deletes `ws_lastsong:<did>` from Redis and publishes
  `rocksky.song.stopped` — exactly the Node timer callback.
  """
  use GenServer

  @default_ms 15_000

  # ---- API ----

  def start_link(opts), do: GenServer.start_link(__MODULE__, opts, name: __MODULE__)

  @doc "Schedule (or reschedule) the debounced song.stopped for `did`."
  def schedule(did), do: GenServer.cast(__MODULE__, {:schedule, did})

  @doc "Cancel a pending song.stopped for `did` (no-op if none pending)."
  def cancel(did), do: GenServer.cast(__MODULE__, {:cancel, did})

  @doc "Whether a song.stopped is currently pending for `did`."
  def has_pending?(did), do: GenServer.call(__MODULE__, {:has_pending?, did})

  # ---- Server ----

  @impl true
  def init(_opts), do: {:ok, %{timers: %{}}}

  @impl true
  def handle_cast({:schedule, did}, state) do
    state = cancel_timer(state, did)
    ref = Process.send_after(self(), {:fire, did}, debounce_ms())
    {:noreply, put_in(state.timers[did], ref)}
  end

  @impl true
  def handle_cast({:cancel, did}, state) do
    {:noreply, cancel_timer(state, did)}
  end

  @impl true
  def handle_call({:has_pending?, did}, _from, state) do
    {:reply, Map.has_key?(state.timers, did), state}
  end

  @impl true
  def handle_info({:fire, did}, state) do
    RemoteWs.Redis.del("ws_lastsong:#{did}")
    RemoteWs.Nats.publish("rocksky.song.stopped", Jason.encode!(%{did: did}))
    {:noreply, %{state | timers: Map.delete(state.timers, did)}}
  end

  defp cancel_timer(state, did) do
    case Map.pop(state.timers, did) do
      {nil, _} ->
        state

      {ref, timers} ->
        Process.cancel_timer(ref)
        %{state | timers: timers}
    end
  end

  defp debounce_ms, do: Application.get_env(:remote_ws, :stop_debounce_ms, @default_ms)
end
