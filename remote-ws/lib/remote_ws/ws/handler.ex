defmodule RemoteWs.Ws.Handler do
  @moduledoc """
  Dispatches a decoded inbound message to the register / command / message logic
  — a port of the `onMessage` body in apps/api/src/websocket/handler.ts.

  Pure with respect to the socket: it returns `{frames, new_state}` where `frames`
  is a list of JSON strings to push back to THIS connection, and performs
  broadcasts to other connections via RemoteWs.Devices. `conn_state` is the
  per-connection `%{device_id, did}`.

  Auth failures and unknown messages are swallowed (return `{[], state}`),
  mirroring the Node handler's try/catch which logs and drops.
  """

  alias RemoteWs.{Auth, Devices, NowPlaying}

  @type state :: %{device_id: String.t() | nil, did: String.t() | nil}

  @spec handle(map(), state()) :: {[String.t()], state()}
  def handle(%{"type" => "register"} = msg, state), do: register(msg, state)
  def handle(%{"type" => "command"} = msg, state), do: command(msg, state)
  def handle(%{"type" => "set_primary"} = msg, state), do: set_primary(msg, state)
  def handle(%{"type" => "message"} = msg, state), do: device_message(msg, state)
  def handle(_msg, state), do: {[], state}

  @doc """
  Called when a connection closes (from RemoteWs.Ws.Connection.terminate/2):
  announce the departure to the user's other devices and, if this was the primary
  device, end the profile now-playing.
  """
  def on_disconnect(%{did: did, device_id: device_id})
      when is_binary(did) and is_binary(device_id) do
    Devices.broadcast_except(
      did,
      device_id,
      Jason.encode!(%{type: "device_unregistered", device_id: device_id})
    )

    NowPlaying.on_disconnect(did, device_id)
    :ok
  end

  def on_disconnect(_state), do: :ok

  # ---- register (handler.ts lines 320-354) ----

  defp register(%{"clientName" => client_name, "token" => token}, state)
       when is_binary(client_name) do
    case Auth.verify_token(token) do
      {:ok, %{did: did}} when is_binary(did) ->
        device_id = Ecto.UUID.generate()
        Devices.register(did, device_id, client_name)

        # Announce to the user's OTHER devices.
        Devices.broadcast_except(
          did,
          device_id,
          Jason.encode!(%{
            type: "device_registered",
            deviceId: device_id,
            clientName: client_name
          })
        )

        reply = Jason.encode!(%{status: "registered", deviceId: device_id})
        # Hand the new client a snapshot of the players currently streaming, so it
        # can populate its device list immediately (without waiting for the next
        # push). Only devices that have actually sent a track appear — controllers
        # (web/mobile) that never send a track are excluded.
        snapshot = Jason.encode!(devices_snapshot(did))
        {[reply, snapshot], %{state | device_id: device_id, did: did}}

      _ ->
        {[], state}
    end
  end

  defp register(_msg, state), do: {[], state}

  defp devices_snapshot(did) do
    devices =
      for %{device_id: id, name: name} <- Devices.metas(did),
          np = NowPlaying.device_np(did, id),
          not is_nil(np) do
        %{device_id: id, name: name, now_playing: np}
      end

    %{type: "devices", primary_device: NowPlaying.primary_device(did), devices: devices}
  end

  # ---- set_primary: the UI selected a device as the profile/scrobble source ----

  defp set_primary(%{"device_id" => device_id, "token" => token}, state)
       when is_binary(device_id) do
    case Auth.verify_token(token) do
      {:ok, %{did: did}} when is_binary(did) ->
        NowPlaying.set_primary(did, device_id, Devices.name_of(did, device_id))
        {[], state}

      _ ->
        {[], state}
    end
  end

  defp set_primary(_msg, state), do: {[], state}

  # ---- command (handler.ts lines 286-317) ----

  defp command(%{"action" => action, "token" => token} = msg, state) do
    case Auth.verify_token(token) do
      {:ok, %{did: did}} when is_binary(did) ->
        out = Jason.encode!(command_out(msg["type"], action, msg["args"]))
        target = msg["target"]

        if is_binary(target) and Devices.send_to(did, target, out) == :ok do
          :ok
        else
          Devices.broadcast(did, out)
        end

        {[], state}

      _ ->
        {[], state}
    end
  end

  defp command(_msg, state), do: {[], state}

  # `args` is omitted when nil, matching JSON.stringify dropping `undefined`.
  defp command_out(type, action, nil), do: %{type: type, action: action}
  defp command_out(type, action, args), do: %{type: type, action: action, args: args}

  # ---- device message: track / status (handler.ts lines 64-283) ----

  defp device_message(%{"data" => data, "device_id" => device_id, "token" => token}, state)
       when is_map(data) do
    case Auth.verify_token(token) do
      {:ok, %{did: did}} when is_binary(did) ->
        name =
          Devices.name_of(did, device_id) || Devices.name_of(did, state.device_id) || "websocket"

        data =
          if data["type"] == "track" do
            NowPlaying.handle_track(did, device_id, name, data)
          else
            NowPlaying.handle_status(did, device_id, data)
            data
          end

        Devices.broadcast(did, Jason.encode!(broadcast_envelope(data, device_id, name)))
        {[], state}

      _ ->
        {[], state}
    end
  end

  defp device_message(_msg, state), do: {[], state}

  # device_name omitted when nil (JSON.stringify drops undefined).
  defp broadcast_envelope(data, device_id, nil),
    do: %{type: "message", data: data, device_id: device_id}

  defp broadcast_envelope(data, device_id, device_name),
    do: %{type: "message", data: data, device_id: device_id, device_name: device_name}
end
