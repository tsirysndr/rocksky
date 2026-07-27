defmodule RemoteWs.Schema.User do
  @moduledoc "Mirrors apps/api schema/users (the `users` table)."
  use Ecto.Schema

  @primary_key {:id, :string, source: :xata_id, autogenerate: false}
  schema "users" do
    field :did, :string
    field :handle, :string
  end
end
