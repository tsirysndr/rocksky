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
  def handle(%{"type" => "message"} = msg, state), do: device_message(msg, state)
  def handle(_msg, state), do: {[], state}

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
        {[reply], %{state | device_id: device_id, did: did}}

      _ ->
        {[], state}
    end
  end

  defp register(_msg, state), do: {[], state}

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
        data =
          if data["type"] == "track" do
            source = source_name(did, device_id, state.device_id)
            NowPlaying.handle_track(did, data, source)
          else
            NowPlaying.handle_status(did, data)
            data
          end

        device_name = Devices.name_of(did, device_id) || Devices.name_of(did, state.device_id)

        Devices.broadcast(did, Jason.encode!(broadcast_envelope(data, device_id, device_name)))
        {[], state}

      _ ->
        {[], state}
    end
  end

  defp device_message(_msg, state), do: {[], state}

  # source for song.changed: name of the message's device, else this connection's.
  defp source_name(did, device_id, own_device_id) do
    Devices.name_of(did, device_id) || Devices.name_of(did, own_device_id) || "websocket"
  end

  # device_name omitted when nil (JSON.stringify drops undefined).
  defp broadcast_envelope(data, device_id, nil),
    do: %{type: "message", data: data, device_id: device_id}

  defp broadcast_envelope(data, device_id, device_name),
    do: %{type: "message", data: data, device_id: device_id, device_name: device_name}
end
