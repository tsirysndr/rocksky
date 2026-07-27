ExUnit.start()

# Shared in-memory doubles for Redis and the read store (the app itself does not
# start Redis/Postgres/NATS in test — see config/test.exs start_externals: false).
{:ok, _} = RemoteWs.Test.RedisMemory.start_link()
{:ok, _} = RemoteWs.Test.StoreStub.start_link()
