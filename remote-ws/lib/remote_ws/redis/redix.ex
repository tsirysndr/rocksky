defmodule RemoteWs.Redis.Redix do
  @moduledoc "Redix-backed Redis adapter (production)."
  @behaviour RemoteWs.Redis

  @conn RemoteWs.Redix

  @impl true
  def get(key) do
    case Redix.command(@conn, ["GET", key]) do
      {:ok, value} -> value
      _ -> nil
    end
  end

  @impl true
  def set_ex(key, seconds, value) do
    Redix.command(@conn, ["SET", key, value, "EX", to_string(seconds)])
    :ok
  end

  @impl true
  def del(key) do
    Redix.command(@conn, ["DEL", key])
    :ok
  end

  @impl true
  def exists(key) do
    case Redix.command(@conn, ["EXISTS", key]) do
      {:ok, n} when is_integer(n) -> n > 0
      _ -> false
    end
  end
end
