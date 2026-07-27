defmodule RemoteWs.Redis do
  @moduledoc """
  The subset of Redis the relay uses (mirrors ctx.redis in apps/api). Backed by
  Redix in production; an in-memory map in test. Dispatches to the module in
  `:remote_ws, :redis`.
  """

  @callback get(String.t()) :: String.t() | nil
  @callback set_ex(String.t(), non_neg_integer(), String.t()) :: :ok
  @callback del(String.t()) :: :ok
  @callback exists(String.t()) :: boolean()

  defp impl, do: Application.get_env(:remote_ws, :redis, RemoteWs.Redis.Redix)

  def get(key), do: impl().get(key)
  def set_ex(key, seconds, value), do: impl().set_ex(key, seconds, value)
  def del(key), do: impl().del(key)
  def exists(key), do: impl().exists(key)
end
