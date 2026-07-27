defmodule RemoteWs.Schema.AccessToken do
  @moduledoc "Mirrors apps/api schema/access-tokens (the `access_tokens` table)."
  use Ecto.Schema

  @primary_key {:id, :string, source: :xata_id, autogenerate: false}
  schema "access_tokens" do
    field :jti, :string
  end
end
