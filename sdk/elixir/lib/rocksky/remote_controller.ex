defmodule Rocksky.RemoteController do
  @moduledoc """
  Build a Rocksky remote UI over the remote-control WebSocket
  (see `remote-ws/PROTOCOL.md`) — the other half of `Rocksky.RemotePlayer`.

  `connect/2,3` registers in the background; you observe the user's players by
  polling `next_event/1` (or via `listen/2`) and drive them with commands
  (`set_primary/2`, `play/2`, `pause/2`, `next/2`, `previous/2`, `seek/3`,
  `queue_jump/3`, `queue_remove/3`, `enqueue/6`). Heartbeat, reconnect, and the
  register handshake are handled by the native core.

  Every command takes a `target` device id; pass `nil` (or `""`) to broadcast to
  all the user's devices.

      ctl = Rocksky.RemoteController.connect(token, "My Controller")

      Rocksky.RemoteController.listen(ctl, %{
        devices: fn e -> render(e["devices"]) end,
        now_playing: fn e -> show_track(e["deviceId"], e["track"]) end
      })

      Rocksky.RemoteController.set_primary(ctl, device_id)
      Rocksky.RemoteController.pause(ctl, device_id)
      Rocksky.RemoteController.seek(ctl, device_id, 42_000)

  The handle is an opaque NIF resource (freed by GC). Commands return
  `{:ok, value}` | `{:error, message}`.
  """

  @doc """
  Connect and register a controller. `name` is a registration label (controllers
  are hidden from device lists); `url` overrides the WebSocket endpoint
  (`nil` = public). Returns the opaque controller handle.
  """
  def connect(token, name, url \\ nil)

  def connect(token, name, nil),
    do: :rocksky_remote_controller.connect(to_bin(token), to_bin(name))

  def connect(token, name, url),
    do: :rocksky_remote_controller.connect(to_bin(token), to_bin(name), to_bin(url))

  @doc "Choose the primary (scrobble/profile) device."
  def set_primary(handle, device_id),
    do: :rocksky_remote_controller.set_primary(handle, to_bin(device_id))

  @doc "Play. `target` is a device id, or `nil` to broadcast to all devices."
  def play(handle, target \\ nil),
    do: :rocksky_remote_controller.play(handle, to_bin(target))

  @doc "Pause (`nil` target broadcasts)."
  def pause(handle, target \\ nil),
    do: :rocksky_remote_controller.pause(handle, to_bin(target))

  @doc "Skip to the next track (`nil` target broadcasts)."
  def next(handle, target \\ nil),
    do: :rocksky_remote_controller.next(handle, to_bin(target))

  @doc "Skip to the previous track (`nil` target broadcasts)."
  def previous(handle, target \\ nil),
    do: :rocksky_remote_controller.previous(handle, to_bin(target))

  @doc "Seek the target device to `position_ms` (`nil` target broadcasts)."
  def seek(handle, target, position_ms),
    do: :rocksky_remote_controller.seek(handle, to_bin(target), position_ms)

  @doc "Jump to `index` in the target device's queue (`nil` target broadcasts)."
  def queue_jump(handle, target, index),
    do: :rocksky_remote_controller.queue_jump(handle, to_bin(target), index)

  @doc "Remove queue item `index` on the target device (`nil` target broadcasts)."
  def queue_remove(handle, target, index),
    do: :rocksky_remote_controller.queue_remove(handle, to_bin(target), index)

  @doc """
  Enqueue `tracks` (a list of queue-item maps, camelCase string keys) on the
  target device. `mode` is `"now"` | `"next"` | `"last"`; `shuffle` is a boolean;
  `start_index` is 0-based. `nil` target broadcasts.
  """
  def enqueue(handle, target, tracks, mode \\ "now", shuffle \\ false, start_index \\ 0)
      when is_list(tracks),
      do:
        :rocksky_remote_controller.enqueue(
          handle,
          to_bin(target),
          tracks,
          to_bin(mode),
          shuffle,
          start_index
        )

  @doc """
  Block until the next update, returned as a decoded event map with a `"type"`
  key (`"devices"`, `"device_registered"`, `"device_unregistered"`,
  `"primary_changed"`, `"now_playing"`, `"status"`, `"queue"`). A
  `"now_playing"` event carries the track under `"track"` (camelCase string
  keys, including the optional `"codec"` and `"sampleRate"` audio info when the
  player advertised them). Returns `nil` once the controller is disconnected.
  """
  def next_event(handle) do
    case :rocksky_remote_controller.next_event(handle) do
      :undefined -> nil
      {:error, _} -> nil
      event when is_map(event) -> event
      _ -> nil
    end
  end

  @doc "Disconnect and stop the background task."
  def disconnect(handle),
    do: :rocksky_remote_controller.disconnect(handle)

  @doc """
  Spawn a process that loops `next_event/1` and dispatches each event to the
  matching function in `handlers`. Returns `{:ok, pid}`. The loop ends when the
  controller disconnects.

  `handlers` is a map keyed by event type; each function receives the full event
  map: `:devices`, `:device_registered`, `:device_unregistered`,
  `:primary_changed`, `:now_playing`, `:status`, `:queue`. Unhandled events are
  ignored.
  """
  def listen(handle, handlers) when is_map(handlers),
    do: Task.start(fn -> listen_loop(handle, handlers) end)

  defp listen_loop(handle, handlers) do
    case next_event(handle) do
      nil ->
        :ok

      event ->
        dispatch(event, handlers)
        listen_loop(handle, handlers)
    end
  end

  defp dispatch(%{"type" => type} = event, handlers) do
    case event_key(type) do
      nil ->
        :ok

      key ->
        case Map.get(handlers, key) do
          fun when is_function(fun) -> apply(fun, [event])
          _ -> :ok
        end
    end
  end

  defp dispatch(_, _), do: :ok

  defp event_key("devices"), do: :devices
  defp event_key("device_registered"), do: :device_registered
  defp event_key("device_unregistered"), do: :device_unregistered
  defp event_key("primary_changed"), do: :primary_changed
  defp event_key("now_playing"), do: :now_playing
  defp event_key("status"), do: :status
  defp event_key("queue"), do: :queue
  defp event_key(_), do: nil

  defp to_bin(nil), do: ""
  defp to_bin(s) when is_binary(s), do: s
  defp to_bin(s), do: to_string(s)
end
