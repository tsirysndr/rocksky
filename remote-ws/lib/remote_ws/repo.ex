defmodule RemoteWs.Repo do
  use Ecto.Repo,
    otp_app: :remote_ws,
    adapter: Ecto.Adapters.Postgres
end
