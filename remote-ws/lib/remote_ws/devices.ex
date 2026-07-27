defmodule RemoteWs.Devices do
  @moduledoc """
  Connected-device bookkeeping, scoped by user DID. Replaces the Node handler's
  module-level `devices`, `deviceNames`, and `userDevices` maps with a duplicate
  `Registry` keyed by DID: each connection process registers one entry, so
  disconnects clean up automatically (replacing the explicit `onClose` handler).

  Frames are delivered to a connection by sending `{:push, frame}` to its process
  (see RemoteWs.Ws.Connection.handle_info/2).
  """

  @registry RemoteWs.Devices.Registry

  @doc "Register the CALLING process as a device for `did`. Call from the connection process."
  def register(did, device_id, name) do
    {:ok, _} = Registry.register(@registry, did, %{device_id: device_id, name: name})
    :ok
  end

  @doc "All {pid, %{device_id, name}} entries for a user."
  def list(did), do: Registry.lookup(@registry, did)

  @doc "The %{device_id, name} metadata for every connected device of a user."
  def metas(did), do: Enum.map(list(did), fn {_pid, meta} -> meta end)

  @doc "Whether `device_id` is currently connected under `did`."
  def connected?(did, device_id) do
    Enum.any?(list(did), fn {_pid, %{device_id: id}} -> id == device_id end)
  end

  @doc "The clientName registered for a given device_id under `did`, or nil."
  def name_of(_did, nil), do: nil

  def name_of(did, device_id) do
    Enum.find_value(list(did), fn {_pid, %{device_id: id, name: name}} ->
      if id == device_id, do: name
    end)
  end

  @doc "Send a frame to every one of the user's connected devices (including the sender)."
  def broadcast(did, frame) do
    for {pid, _} <- list(did), do: send(pid, {:push, frame})
    :ok
  end

  @doc "Send a frame to every device EXCEPT the one with `except_device_id`."
  def broadcast_except(did, except_device_id, frame) do
    for {pid, %{device_id: id}} <- list(did), id != except_device_id do
      send(pid, {:push, frame})
    end

    :ok
  end

  @doc """
  Send a frame to the single device `target_device_id`. Returns :ok if a matching
  device was found, :not_found otherwise.
  """
  def send_to(did, target_device_id, frame) do
    case Enum.find(list(did), fn {_pid, %{device_id: id}} -> id == target_device_id end) do
      {pid, _} ->
        send(pid, {:push, frame})
        :ok

      nil ->
        :not_found
    end
  end
end
