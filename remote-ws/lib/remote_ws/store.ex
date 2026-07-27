defmodule RemoteWs.Store do
  @moduledoc """
  Read model for the relay: track metadata, like status, and access-token
  existence. Backed by Ecto in production (RemoteWs.Store.Ecto); swapped for an
  in-memory stub in test. Dispatches to the module in `:remote_ws, :store`.
  """

  @callback get_track_by_sha256(String.t()) :: map() | nil
  @callback get_tracks_by_sha256(list(String.t())) :: %{String.t() => map()}
  @callback liked?(String.t(), String.t()) :: boolean()
  @callback access_token_exists?(String.t()) :: boolean()

  defp impl, do: Application.get_env(:remote_ws, :store, RemoteWs.Store.Ecto)

  def get_track_by_sha256(sha256), do: impl().get_track_by_sha256(sha256)
  def get_tracks_by_sha256(shas), do: impl().get_tracks_by_sha256(shas)
  def liked?(did, sha256), do: impl().liked?(did, sha256)
  def access_token_exists?(jti), do: impl().access_token_exists?(jti)
end
