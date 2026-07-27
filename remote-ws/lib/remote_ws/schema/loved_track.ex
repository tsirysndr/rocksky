defmodule RemoteWs.Schema.LovedTrack do
  @moduledoc "Mirrors apps/api schema/loved-tracks (the `loved_tracks` table)."
  use Ecto.Schema

  @primary_key {:id, :string, source: :xata_id, autogenerate: false}
  schema "loved_tracks" do
    field :user_id, :string
    field :track_id, :string
  end
end
