defmodule RemoteWs.Schema.Track do
  @moduledoc "Mirrors apps/api schema/tracks (the `tracks` table)."
  use Ecto.Schema

  @primary_key {:id, :string, source: :xata_id, autogenerate: false}
  schema "tracks" do
    field :title, :string
    field :artist, :string
    field :album, :string
    field :album_artist, :string
    field :album_art, :string
    field :duration, :integer
    field :sha256, :string
    field :uri, :string
    field :album_uri, :string
    field :artist_uri, :string
  end
end
