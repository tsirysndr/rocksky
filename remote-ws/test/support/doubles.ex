defmodule RemoteWs.Test.RedisMemory do
  @moduledoc "In-memory Redis double (ignores TTLs) for tests."
  @behaviour RemoteWs.Redis
  use Agent

  def start_link(_opts \\ []), do: Agent.start_link(fn -> %{} end, name: __MODULE__)
  def reset, do: Agent.update(__MODULE__, fn _ -> %{} end)

  # Seed a key directly (test helper).
  def put(key, value), do: Agent.update(__MODULE__, &Map.put(&1, key, value))

  @impl true
  def get(key), do: Agent.get(__MODULE__, &Map.get(&1, key))

  @impl true
  def set_ex(key, _seconds, value), do: Agent.update(__MODULE__, &Map.put(&1, key, value))

  @impl true
  def del(key), do: Agent.update(__MODULE__, &Map.delete(&1, key))

  @impl true
  def exists(key), do: Agent.get(__MODULE__, &Map.has_key?(&1, key))
end

defmodule RemoteWs.Test.StoreStub do
  @moduledoc "Configurable in-memory Store double for tests."
  @behaviour RemoteWs.Store
  use Agent

  def start_link(_opts \\ []),
    do: Agent.start_link(fn -> empty() end, name: __MODULE__)

  def reset, do: Agent.update(__MODULE__, fn _ -> empty() end)

  defp empty, do: %{tracks: %{}, likes: MapSet.new(), tokens: MapSet.new()}

  # Test seeders.
  def put_track(sha256, map), do: Agent.update(__MODULE__, &put_in(&1.tracks[sha256], map))

  def set_liked(did, sha256),
    do: Agent.update(__MODULE__, &%{&1 | likes: MapSet.put(&1.likes, {did, sha256})})

  def put_token(jti), do: Agent.update(__MODULE__, &%{&1 | tokens: MapSet.put(&1.tokens, jti)})

  @impl true
  def get_track_by_sha256(sha256), do: Agent.get(__MODULE__, &Map.get(&1.tracks, sha256))

  @impl true
  def liked?(did, sha256), do: Agent.get(__MODULE__, &MapSet.member?(&1.likes, {did, sha256}))

  @impl true
  def access_token_exists?(jti), do: Agent.get(__MODULE__, &MapSet.member?(&1.tokens, jti))
end

defmodule RemoteWs.Test.NatsCollector do
  @moduledoc """
  NATS double that forwards each publish to the test process registered in
  `:remote_ws, :nats_test_pid` as `{:nats, subject, decoded_payload}`.
  """
  @behaviour RemoteWs.Nats

  @impl true
  def publish(subject, payload) do
    case Application.get_env(:remote_ws, :nats_test_pid) do
      pid when is_pid(pid) -> send(pid, {:nats, subject, Jason.decode!(payload)})
      _ -> :ok
    end

    :ok
  end
end

defmodule RemoteWs.Test.Token do
  @moduledoc "Mint HS256 JWTs signed with the test secret."
  def sign(claims) do
    secret = Application.fetch_env!(:remote_ws, :jwt_secret)
    signer = Joken.Signer.create("HS256", secret)
    {:ok, token} = Joken.Signer.sign(claims, signer)
    token
  end
end

defmodule RemoteWs.Test.FakeDevice do
  @moduledoc """
  A stand-in connection process: registers itself as a device and relays every
  `{:push, frame}` it receives to `report_to` as `{:pushed, self(), frame}`.
  """
  alias RemoteWs.Devices

  def start(did, device_id, name, report_to) do
    pid =
      spawn(fn ->
        Devices.register(did, device_id, name)
        send(report_to, {:registered, device_id, self()})
        loop(report_to)
      end)

    receive do
      {:registered, ^device_id, ^pid} -> pid
    after
      1000 -> raise "FakeDevice #{device_id} failed to register"
    end
  end

  defp loop(report_to) do
    receive do
      {:push, frame} ->
        send(report_to, {:pushed, self(), frame})
        loop(report_to)

      :stop ->
        :ok
    end
  end
end
