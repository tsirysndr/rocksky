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

  `handle/2` is the telemetry boundary: it wraps `dispatch/2` in one root span
  named after what the frame does, and one `rocksky.work.*` sample under the same
  name. See `RemoteWs.Telemetry`.
  """

  require OpenTelemetry.Tracer

  alias RemoteWs.{Auth, Devices, NowPlaying, Telemetry}

  @type state :: %{device_id: String.t() | nil, did: String.t() | nil}

  @spec handle(map(), state()) :: {[String.t()], state()}
  def handle(msg, state) do
    Telemetry.work(span_name(msg), span_attributes(msg, state), fn ->
      {frames, new_state} = dispatch(msg, state)
      # `register` is where the connection learns its did and device id, so its
      # span can only be labelled with them once the work is done.
      OpenTelemetry.Tracer.set_attributes(identity(new_state))
      {frames, new_state}
    end)
  end

  defp dispatch(%{"type" => "register"} = msg, state), do: register(msg, state)
  defp dispatch(%{"type" => "command"} = msg, state), do: command(msg, state)
  defp dispatch(%{"type" => "set_primary"} = msg, state), do: set_primary(msg, state)
  defp dispatch(%{"type" => "message"} = msg, state), do: device_message(msg, state)
  defp dispatch(_msg, state), do: {[], state}

  # ---- telemetry labelling ----

  defp span_name(%{"type" => "message"} = msg), do: "ws.message." <> data_type(msg)

  defp span_name(%{"type" => type}) when type in ~w(register command set_primary),
    do: "ws." <> type

  defp span_name(_msg), do: "ws.unknown"

  # The branches device_message/2 dispatches on. Anything else is handled as a
  # status push, so it is labelled as one rather than becoming a time series of
  # its own for whatever a client made up.
  defp data_type(%{"data" => %{"type" => "track"}}), do: "track"
  defp data_type(%{"data" => %{"type" => "queue"}}), do: "queue"
  defp data_type(_msg), do: "status"

  defp span_attributes(%{"type" => "command", "action" => action}, state) when is_binary(action),
    do: Map.put(identity(state), :"rocksky.ws.action", action)

  defp span_attributes(_msg, state), do: identity(state)

  defp identity(state) do
    %{}
    |> put_present(:"rocksky.did", state[:did])
    |> put_present(:"rocksky.device_id", state[:device_id])
  end

  defp put_present(attributes, _key, nil), do: attributes
  defp put_present(attributes, key, value), do: Map.put(attributes, key, value)

  @doc """
  Called when a connection closes (from RemoteWs.Ws.Connection.terminate/2):
  announce the departure to the user's other devices and, if this was the primary
  device, end the profile now-playing.
  """
  def on_disconnect(%{did: did, device_id: device_id} = state)
      when is_binary(did) and is_binary(device_id) do
    Telemetry.work("ws.disconnect", identity(state), fn ->
      Devices.broadcast_except(
        did,
        device_id,
        Jason.encode!(%{type: "device_unregistered", device_id: device_id})
      )

      NowPlaying.on_disconnect(did, device_id)
      :ok
    end)
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
        %{device_id: id, name: name, now_playing: np, queue: NowPlaying.device_queue(did, id)}
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

  defp device_message(%{"data" => data, "token" => token}, state) when is_map(data) do
    case Auth.verify_token(token) do
      # Use the CONNECTION's registered device_id — the authoritative routing id
      # assigned at register — NOT the `device_id` the client puts in the payload.
      # A client's self-reported id can be wrong (e.g. an old CLI that clobbered
      # its own id from a device_registered broadcast); that would tag its tracks
      # with another device's id, so the miniplayer would send commands to the
      # wrong place (they'd never reach the player) even though state still syncs.
      {:ok, %{did: did}} when is_binary(did) and is_binary(state.device_id) ->
        device_id = state.device_id
        name = Devices.name_of(did, device_id) || "websocket"

        data =
          case data["type"] do
            "track" ->
              NowPlaying.handle_track(did, device_id, name, data)

            "queue" ->
              NowPlaying.handle_queue(did, device_id, data)

            _ ->
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
