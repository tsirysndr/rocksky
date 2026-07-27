defmodule RemoteWs.Redis.Redix do
  @moduledoc """
  Redix-backed Redis adapter (production).

  Every call is wrapped so a dead/restarting Redix connection can never crash the
  caller. `Redix.command/3` *exits* (not `{:error, _}`) with
  `{:redix_exited_during_call, :noproc}` when the connection process is gone — e.g.
  during a service restart, while many WebSocket `terminate/2` handlers are still
  running `on_disconnect` Redis calls. Treat any failure as a cache miss / no-op.
  """
  @behaviour RemoteWs.Redis

  @conn RemoteWs.Redix

  defp safe(fun, default) do
    try do
      fun.()
    catch
      :exit, _ -> default
    end
  end

  @impl true
  def get(key) do
    safe(
      fn ->
        case Redix.command(@conn, ["GET", key]) do
          {:ok, value} -> value
          _ -> nil
        end
      end,
      nil
    )
  end

  @impl true
  def set_ex(key, seconds, value) do
    safe(fn -> Redix.command(@conn, ["SET", key, value, "EX", to_string(seconds)]) end, nil)
    :ok
  end

  @impl true
  def del(key) do
    safe(fn -> Redix.command(@conn, ["DEL", key]) end, nil)
    :ok
  end

  @impl true
  def exists(key) do
    safe(
      fn ->
        case Redix.command(@conn, ["EXISTS", key]) do
          {:ok, n} when is_integer(n) -> n > 0
          _ -> false
        end
      end,
      false
    )
  end
end
