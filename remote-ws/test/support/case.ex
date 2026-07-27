defmodule RemoteWs.Test.Case do
  @moduledoc """
  Base case for relay tests: resets the in-memory Redis/Store doubles and points
  the NATS double at the current test process (so publishes arrive as
  `{:nats, subject, decoded}` messages). Not async — the doubles are shared.
  """
  use ExUnit.CaseTemplate

  using do
    quote do
      import RemoteWs.Test.Case, only: [sha_of: 3]
      alias RemoteWs.Test.{FakeDevice, RedisMemory, StoreStub, Token}
    end
  end

  setup do
    RemoteWs.Test.RedisMemory.reset()
    RemoteWs.Test.StoreStub.reset()
    Application.put_env(:remote_ws, :nats_test_pid, self())
    on_exit(fn -> Application.delete_env(:remote_ws, :nats_test_pid) end)
    :ok
  end

  @doc "Compute the now-playing sha256 the same way NowPlaying does."
  def sha_of(title, artist, album) do
    :crypto.hash(:sha256, String.downcase("#{title} - #{artist} - #{album}"))
    |> Base.encode16(case: :lower)
  end
end
