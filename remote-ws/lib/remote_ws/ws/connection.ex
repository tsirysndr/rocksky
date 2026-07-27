defmodule RemoteWs.Ws.Connection do
  @moduledoc """
  The per-connection WebSocket process (WebSock behaviour, served by Bandit).
  Mirrors one client socket in the Node handler:

    * raw `"ping"` → `"pong"` (handler.ts lines 55-57)
    * every other text frame is decoded as JSON and dispatched to
      RemoteWs.Ws.Handler
    * `{:push, frame}` messages from other connection processes (broadcasts /
      targeted commands) are forwarded to this socket

  Device registry entries are owned by this process, so a disconnect cleans them
  up automatically — no explicit onClose needed.
  """
  @behaviour WebSock

  alias RemoteWs.Ws.Handler

  @impl true
  def init(_opts), do: {:ok, %{device_id: nil, did: nil}}

  @impl true
  def handle_in({"ping", [opcode: :text]}, state) do
    {:push, {:text, "pong"}, state}
  end

  def handle_in({text, [opcode: :text]}, state) do
    case Jason.decode(text) do
      {:ok, msg} when is_map(msg) ->
        {frames, new_state} = Handler.handle(msg, state)
        push(frames, new_state)

      _ ->
        {:ok, state}
    end
  end

  # Ignore binary frames.
  def handle_in({_data, _opts}, state), do: {:ok, state}

  @impl true
  def handle_info({:push, frame}, state) do
    {:push, {:text, frame}, state}
  end

  def handle_info(_other, state), do: {:ok, state}

  @impl true
  def terminate(_reason, _state), do: :ok

  defp push([], state), do: {:ok, state}
  defp push(frames, state), do: {:push, Enum.map(frames, &{:text, &1}), state}
end
