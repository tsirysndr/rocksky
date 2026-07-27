defmodule RemoteWs.Store.Ecto do
  @moduledoc "Ecto-backed Store — the production read model (Postgres/Xata)."
  @behaviour RemoteWs.Store

  import Ecto.Query

  alias RemoteWs.Repo
  alias RemoteWs.Schema.{AccessToken, LovedTrack, Track, User}

  @impl true
  def get_track_by_sha256(sha256) do
    from(t in Track,
      where: t.sha256 == ^sha256,
      select: %{
        album_art: t.album_art,
        uri: t.uri,
        album_uri: t.album_uri,
        artist_uri: t.artist_uri,
        duration: t.duration
      },
      limit: 1
    )
    |> Repo.one()
  end

  @impl true
  def get_tracks_by_sha256([]), do: %{}

  def get_tracks_by_sha256(shas) do
    from(t in Track,
      where: t.sha256 in ^shas,
      select: {
        t.sha256,
        %{
          album_art: t.album_art,
          uri: t.uri,
          album_uri: t.album_uri,
          artist_uri: t.artist_uri,
          duration: t.duration
        }
      }
    )
    |> Repo.all()
    |> Map.new()
  end

  @impl true
  def liked?(did, sha256) do
    from(lt in LovedTrack,
      join: t in Track,
      on: lt.track_id == t.id,
      join: u in User,
      on: lt.user_id == u.id,
      where: u.did == ^did and t.sha256 == ^sha256
    )
    |> Repo.exists?()
  end

  @impl true
  def access_token_exists?(jti) do
    from(a in AccessToken, where: a.jti == ^jti)
    |> Repo.exists?()
  end
end
