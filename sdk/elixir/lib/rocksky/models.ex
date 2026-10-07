# Generated from lexicons.
defmodule Rocksky.Models.BlobCidRef do
  @enforce_keys [:link]
  defstruct [:link]
  @type t :: %__MODULE__{link: String.t()}
  def __schema__, do: [{"$link", :link, true, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.BlobRef do
  @enforce_keys [:type, :ref, :mime_type, :size]
  defstruct [:type, :ref, :mime_type, :size]
  @type t :: %__MODULE__{type: String.t(), ref: Rocksky.Models.BlobCidRef.t(), mime_type: String.t(), size: integer()}
  def __schema__, do: [{"$type", :type, true, false, :string}, {"ref", :ref, true, false, {:record, Rocksky.Models.BlobCidRef}}, {"mimeType", :mime_type, true, false, :string}, {"size", :size, true, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.ActorArtistViewBasic do
  @enforce_keys []
  defstruct [:id, :name, :picture, :uri, :user1_rank, :user2_rank, :weight]
  @type t :: %__MODULE__{id: String.t() | nil, name: String.t() | nil, picture: String.t() | nil, uri: String.t() | nil, user1_rank: integer() | nil, user2_rank: integer() | nil, weight: float() | nil}
  def __schema__, do: [{"id", :id, false, false, :string}, {"name", :name, false, false, :string}, {"picture", :picture, false, false, :string}, {"uri", :uri, false, false, :string}, {"user1Rank", :user1_rank, false, false, :integer}, {"user2Rank", :user2_rank, false, false, :integer}, {"weight", :weight, false, false, :float}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.ActorCompatibilityViewBasic do
  @enforce_keys []
  defstruct [:compatibility_level, :shared_artists, :top_shared_artist_names, :top_shared_detailed_artists, :user1_artist_count, :user2_artist_count, :compatibility_percentage]
  @type t :: %__MODULE__{compatibility_level: integer() | nil, shared_artists: integer() | nil, top_shared_artist_names: [String.t()] | nil, top_shared_detailed_artists: [Rocksky.Models.ActorArtistViewBasic.t()] | nil, user1_artist_count: integer() | nil, user2_artist_count: integer() | nil, compatibility_percentage: float() | nil}
  def __schema__, do: [{"compatibilityLevel", :compatibility_level, false, false, :integer}, {"sharedArtists", :shared_artists, false, false, :integer}, {"topSharedArtistNames", :top_shared_artist_names, false, false, {:list, :string}}, {"topSharedDetailedArtists", :top_shared_detailed_artists, false, false, {:list, {:record, Rocksky.Models.ActorArtistViewBasic}}}, {"user1ArtistCount", :user1_artist_count, false, false, :integer}, {"user2ArtistCount", :user2_artist_count, false, false, :integer}, {"compatibilityPercentage", :compatibility_percentage, false, false, :float}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.ActorNeighbourViewBasic do
  @enforce_keys []
  defstruct [:user_id, :did, :handle, :display_name, :avatar, :shared_artists_count, :top_shared_artist_names, :top_shared_artists_details, :similarity_score]
  @type t :: %__MODULE__{user_id: String.t() | nil, did: String.t() | nil, handle: String.t() | nil, display_name: String.t() | nil, avatar: String.t() | nil, shared_artists_count: integer() | nil, top_shared_artist_names: [String.t()] | nil, top_shared_artists_details: [Rocksky.Models.ArtistViewBasic.t()] | nil, similarity_score: float() | nil}
  def __schema__, do: [{"userId", :user_id, false, false, :string}, {"did", :did, false, false, :string}, {"handle", :handle, false, false, :string}, {"displayName", :display_name, false, false, :string}, {"avatar", :avatar, false, false, :string}, {"sharedArtistsCount", :shared_artists_count, false, false, :integer}, {"topSharedArtistNames", :top_shared_artist_names, false, false, {:list, :string}}, {"topSharedArtistsDetails", :top_shared_artists_details, false, false, {:list, {:record, Rocksky.Models.ArtistViewBasic}}}, {"similarityScore", :similarity_score, false, false, :float}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.ActorProfileViewBasic do
  @enforce_keys []
  defstruct [:id, :did, :handle, :display_name, :avatar, :created_at, :updated_at]
  @type t :: %__MODULE__{id: String.t() | nil, did: String.t() | nil, handle: String.t() | nil, display_name: String.t() | nil, avatar: String.t() | nil, created_at: String.t() | nil, updated_at: String.t() | nil}
  def __schema__, do: [{"id", :id, false, false, :string}, {"did", :did, false, false, :string}, {"handle", :handle, false, false, :string}, {"displayName", :display_name, false, true, :string}, {"avatar", :avatar, false, true, :string}, {"createdAt", :created_at, false, false, :string}, {"updatedAt", :updated_at, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.ActorProfileViewDetailed do
  @enforce_keys []
  defstruct [:id, :did, :handle, :display_name, :avatar, :created_at, :updated_at, :spotify_user, :spotify_connected, :googledrive, :dropbox]
  @type t :: %__MODULE__{id: String.t() | nil, did: String.t() | nil, handle: String.t() | nil, display_name: String.t() | nil, avatar: String.t() | nil, created_at: String.t() | nil, updated_at: String.t() | nil, spotify_user: Rocksky.Models.ActorResponseSpotifyUserView.t() | nil, spotify_connected: boolean() | nil, googledrive: Rocksky.Models.ActorResponseGoogledriveView.t() | nil, dropbox: Rocksky.Models.ActorResponseDropboxView.t() | nil}
  def __schema__, do: [{"id", :id, false, false, :string}, {"did", :did, false, false, :string}, {"handle", :handle, false, false, :string}, {"displayName", :display_name, false, false, :string}, {"avatar", :avatar, false, false, :string}, {"createdAt", :created_at, false, false, :string}, {"updatedAt", :updated_at, false, false, :string}, {"spotifyUser", :spotify_user, false, false, {:record, Rocksky.Models.ActorResponseSpotifyUserView}}, {"spotifyConnected", :spotify_connected, false, false, :boolean}, {"googledrive", :googledrive, false, false, {:record, Rocksky.Models.ActorResponseGoogledriveView}}, {"dropbox", :dropbox, false, false, {:record, Rocksky.Models.ActorResponseDropboxView}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.ActorResponseDropboxView do
  @enforce_keys []
  defstruct [:created_at, :updated_at, :id, :email, :is_beta_user, :user_id, :xata_version]
  @type t :: %__MODULE__{created_at: String.t() | nil, updated_at: String.t() | nil, id: String.t() | nil, email: String.t() | nil, is_beta_user: boolean() | nil, user_id: String.t() | nil, xata_version: String.t() | nil}
  def __schema__, do: [{"createdAt", :created_at, false, false, :string}, {"updatedAt", :updated_at, false, false, :string}, {"id", :id, false, false, :string}, {"email", :email, false, false, :string}, {"isBetaUser", :is_beta_user, false, false, :boolean}, {"userId", :user_id, false, true, :string}, {"xataVersion", :xata_version, false, true, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.ActorResponseGoogledriveView do
  @enforce_keys []
  defstruct [:created_at, :updated_at]
  @type t :: %__MODULE__{created_at: String.t() | nil, updated_at: String.t() | nil}
  def __schema__, do: [{"createdAt", :created_at, false, false, :string}, {"updatedAt", :updated_at, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.ActorResponseSpotifyUserView do
  @enforce_keys []
  defstruct [:created_at, :updated_at, :id, :xata_version, :user_id, :is_beta_user, :spotify_app_id]
  @type t :: %__MODULE__{created_at: String.t() | nil, updated_at: String.t() | nil, id: String.t() | nil, xata_version: integer() | nil, user_id: String.t() | nil, is_beta_user: boolean() | nil, spotify_app_id: String.t() | nil}
  def __schema__, do: [{"createdAt", :created_at, false, false, :string}, {"updatedAt", :updated_at, false, false, :string}, {"id", :id, false, false, :string}, {"xataVersion", :xata_version, false, true, :integer}, {"userId", :user_id, false, true, :string}, {"isBetaUser", :is_beta_user, false, false, :boolean}, {"spotifyAppId", :spotify_app_id, false, true, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.ActorTrackView do
  @enforce_keys [:name, :artist]
  defstruct [:name, :artist, :album, :album_cover_url, :duration_ms, :source, :recording_mb_id, :track_number]
  @type t :: %__MODULE__{name: String.t(), artist: String.t(), album: String.t() | nil, album_cover_url: String.t() | nil, duration_ms: integer() | nil, source: String.t() | nil, recording_mb_id: String.t() | nil, track_number: integer() | nil}
  def __schema__, do: [{"name", :name, true, false, :string}, {"artist", :artist, true, false, :string}, {"album", :album, false, false, :string}, {"albumCoverUrl", :album_cover_url, false, false, :string}, {"durationMs", :duration_ms, false, false, :integer}, {"source", :source, false, false, :string}, {"recordingMbId", :recording_mb_id, false, false, :string}, {"trackNumber", :track_number, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.AddDirectoryToQueueParams do
  @enforce_keys [:directory]
  defstruct [:player_id, :directory, :position, :shuffle]
  @type t :: %__MODULE__{player_id: String.t() | nil, directory: String.t(), position: integer() | nil, shuffle: boolean() | nil}
  def __schema__, do: [{"playerId", :player_id, false, false, :string}, {"directory", :directory, true, false, :string}, {"position", :position, false, false, :integer}, {"shuffle", :shuffle, false, false, :boolean}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.AddItemsToQueueParams do
  @enforce_keys [:items]
  defstruct [:player_id, :items, :position, :shuffle]
  @type t :: %__MODULE__{player_id: String.t() | nil, items: [String.t()], position: integer() | nil, shuffle: boolean() | nil}
  def __schema__, do: [{"playerId", :player_id, false, false, :string}, {"items", :items, true, false, {:list, :string}}, {"position", :position, false, false, :integer}, {"shuffle", :shuffle, false, false, :boolean}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.AddSongsOutput do
  @enforce_keys [:uris]
  defstruct [:uris]
  @type t :: %__MODULE__{uris: [String.t()]}
  def __schema__, do: [{"uris", :uris, true, false, {:list, :string}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.AddSongsParams do
  @enforce_keys [:uri, :songs]
  defstruct [:uri, :songs]
  @type t :: %__MODULE__{uri: String.t(), songs: [String.t()]}
  def __schema__, do: [{"uri", :uri, true, false, :string}, {"songs", :songs, true, false, {:list, :string}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.AlbumDiscogsArtistView do
  @enforce_keys []
  defstruct [:artist_id, :name, :anv, :join_phrase, :role]
  @type t :: %__MODULE__{artist_id: integer() | nil, name: String.t() | nil, anv: String.t() | nil, join_phrase: String.t() | nil, role: String.t() | nil}
  def __schema__, do: [{"artistId", :artist_id, false, false, :integer}, {"name", :name, false, false, :string}, {"anv", :anv, false, false, :string}, {"joinPhrase", :join_phrase, false, false, :string}, {"role", :role, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.AlbumDiscogsCreditView do
  @enforce_keys []
  defstruct [:artist_id, :name, :role, :tracks]
  @type t :: %__MODULE__{artist_id: integer() | nil, name: String.t() | nil, role: String.t() | nil, tracks: String.t() | nil}
  def __schema__, do: [{"artistId", :artist_id, false, false, :integer}, {"name", :name, false, false, :string}, {"role", :role, false, false, :string}, {"tracks", :tracks, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.AlbumDiscogsIdentifierView do
  @enforce_keys []
  defstruct [:type, :value, :description]
  @type t :: %__MODULE__{type: String.t() | nil, value: String.t() | nil, description: String.t() | nil}
  def __schema__, do: [{"type", :type, false, false, :string}, {"value", :value, false, false, :string}, {"description", :description, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.AlbumDiscogsLabelView do
  @enforce_keys []
  defstruct [:label_id, :name, :catalog_number, :kind, :entity_type]
  @type t :: %__MODULE__{label_id: integer() | nil, name: String.t() | nil, catalog_number: String.t() | nil, kind: String.t() | nil, entity_type: String.t() | nil}
  def __schema__, do: [{"labelId", :label_id, false, false, :integer}, {"name", :name, false, false, :string}, {"catalogNumber", :catalog_number, false, false, :string}, {"kind", :kind, false, false, :string}, {"entityType", :entity_type, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.AlbumDiscogsMasterView do
  @enforce_keys []
  defstruct [:master_id, :title, :artist, :year, :main_release_id, :url, :genres, :styles]
  @type t :: %__MODULE__{master_id: integer() | nil, title: String.t() | nil, artist: String.t() | nil, year: integer() | nil, main_release_id: integer() | nil, url: String.t() | nil, genres: [String.t()] | nil, styles: [String.t()] | nil}
  def __schema__, do: [{"masterId", :master_id, false, false, :integer}, {"title", :title, false, false, :string}, {"artist", :artist, false, false, :string}, {"year", :year, false, false, :integer}, {"mainReleaseId", :main_release_id, false, false, :integer}, {"url", :url, false, false, :string}, {"genres", :genres, false, false, {:list, :string}}, {"styles", :styles, false, false, {:list, :string}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.AlbumDiscogsTrackView do
  @enforce_keys []
  defstruct [:position, :type, :title, :duration, :duration_ms, :disc_number, :track_number]
  @type t :: %__MODULE__{position: String.t() | nil, type: String.t() | nil, title: String.t() | nil, duration: String.t() | nil, duration_ms: integer() | nil, disc_number: integer() | nil, track_number: integer() | nil}
  def __schema__, do: [{"position", :position, false, false, :string}, {"type", :type, false, false, :string}, {"title", :title, false, false, :string}, {"duration", :duration, false, false, :string}, {"durationMs", :duration_ms, false, false, :integer}, {"discNumber", :disc_number, false, false, :integer}, {"trackNumber", :track_number, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.AlbumDiscogsView do
  @enforce_keys []
  defstruct [:release_id, :master_id, :title, :artist, :album_art, :year, :original_year, :release_date, :country, :label, :catalog_number, :barcode, :formats, :genres, :styles, :url, :score, :credits, :tracklist, :labels, :identifiers, :artists, :master]
  @type t :: %__MODULE__{release_id: integer() | nil, master_id: integer() | nil, title: String.t() | nil, artist: String.t() | nil, album_art: String.t() | nil, year: integer() | nil, original_year: integer() | nil, release_date: String.t() | nil, country: String.t() | nil, label: String.t() | nil, catalog_number: String.t() | nil, barcode: String.t() | nil, formats: [String.t()] | nil, genres: [String.t()] | nil, styles: [String.t()] | nil, url: String.t() | nil, score: integer() | nil, credits: [Rocksky.Models.AlbumDiscogsCreditView.t()] | nil, tracklist: [Rocksky.Models.AlbumDiscogsTrackView.t()] | nil, labels: [Rocksky.Models.AlbumDiscogsLabelView.t()] | nil, identifiers: [Rocksky.Models.AlbumDiscogsIdentifierView.t()] | nil, artists: [Rocksky.Models.AlbumDiscogsArtistView.t()] | nil, master: Rocksky.Models.AlbumDiscogsMasterView.t() | nil}
  def __schema__, do: [{"releaseId", :release_id, false, false, :integer}, {"masterId", :master_id, false, false, :integer}, {"title", :title, false, false, :string}, {"artist", :artist, false, false, :string}, {"albumArt", :album_art, false, false, :string}, {"year", :year, false, false, :integer}, {"originalYear", :original_year, false, false, :integer}, {"releaseDate", :release_date, false, false, :string}, {"country", :country, false, false, :string}, {"label", :label, false, false, :string}, {"catalogNumber", :catalog_number, false, false, :string}, {"barcode", :barcode, false, false, :string}, {"formats", :formats, false, false, {:list, :string}}, {"genres", :genres, false, false, {:list, :string}}, {"styles", :styles, false, false, {:list, :string}}, {"url", :url, false, false, :string}, {"score", :score, false, false, :integer}, {"credits", :credits, false, false, {:list, {:record, Rocksky.Models.AlbumDiscogsCreditView}}}, {"tracklist", :tracklist, false, false, {:list, {:record, Rocksky.Models.AlbumDiscogsTrackView}}}, {"labels", :labels, false, false, {:list, {:record, Rocksky.Models.AlbumDiscogsLabelView}}}, {"identifiers", :identifiers, false, false, {:list, {:record, Rocksky.Models.AlbumDiscogsIdentifierView}}}, {"artists", :artists, false, false, {:list, {:record, Rocksky.Models.AlbumDiscogsArtistView}}}, {"master", :master, false, false, {:record, Rocksky.Models.AlbumDiscogsMasterView}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.AlbumGetAlbumParams do
  @enforce_keys [:uri]
  defstruct [:uri]
  @type t :: %__MODULE__{uri: String.t()}
  def __schema__, do: [{"uri", :uri, true, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.AlbumRecord do
  @enforce_keys [:title, :artist, :created_at]
  defstruct [:title, :artist, :duration, :release_date, :year, :genre, :album_art, :album_art_url, :tags, :youtube_link, :spotify_link, :tidal_link, :apple_music_link, :created_at]
  @type t :: %__MODULE__{title: String.t(), artist: String.t(), duration: integer() | nil, release_date: String.t() | nil, year: integer() | nil, genre: String.t() | nil, album_art: Rocksky.Models.BlobRef.t() | nil, album_art_url: String.t() | nil, tags: [String.t()] | nil, youtube_link: String.t() | nil, spotify_link: String.t() | nil, tidal_link: String.t() | nil, apple_music_link: String.t() | nil, created_at: String.t()}
  def __schema__, do: [{"title", :title, true, false, :string}, {"artist", :artist, true, false, :string}, {"duration", :duration, false, false, :integer}, {"releaseDate", :release_date, false, false, :string}, {"year", :year, false, false, :integer}, {"genre", :genre, false, false, :string}, {"albumArt", :album_art, false, false, {:record, Rocksky.Models.BlobRef}}, {"albumArtUrl", :album_art_url, false, false, :string}, {"tags", :tags, false, false, {:list, :string}}, {"youtubeLink", :youtube_link, false, false, :string}, {"spotifyLink", :spotify_link, false, false, :string}, {"tidalLink", :tidal_link, false, false, :string}, {"appleMusicLink", :apple_music_link, false, false, :string}, {"createdAt", :created_at, true, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.AlbumViewBasic do
  @enforce_keys []
  defstruct [:id, :uri, :title, :artist, :artist_uri, :year, :album_art, :release_date, :sha256, :play_count, :unique_listeners, :apple_music_link, :spotify_link, :tidal_link, :youtube_link, :discogs_release_id, :created_at, :updated_at, :xata_version]
  @type t :: %__MODULE__{id: String.t() | nil, uri: String.t() | nil, title: String.t() | nil, artist: String.t() | nil, artist_uri: String.t() | nil, year: integer() | nil, album_art: String.t() | nil, release_date: String.t() | nil, sha256: String.t() | nil, play_count: integer() | nil, unique_listeners: integer() | nil, apple_music_link: String.t() | nil, spotify_link: String.t() | nil, tidal_link: String.t() | nil, youtube_link: String.t() | nil, discogs_release_id: String.t() | nil, created_at: String.t() | nil, updated_at: String.t() | nil, xata_version: integer() | nil}
  def __schema__, do: [{"id", :id, false, false, :string}, {"uri", :uri, false, true, :string}, {"title", :title, false, false, :string}, {"artist", :artist, false, false, :string}, {"artistUri", :artist_uri, false, true, :string}, {"year", :year, false, true, :integer}, {"albumArt", :album_art, false, true, :string}, {"releaseDate", :release_date, false, true, :string}, {"sha256", :sha256, false, false, :string}, {"playCount", :play_count, false, false, :integer}, {"uniqueListeners", :unique_listeners, false, false, :integer}, {"appleMusicLink", :apple_music_link, false, true, :string}, {"spotifyLink", :spotify_link, false, true, :string}, {"tidalLink", :tidal_link, false, true, :string}, {"youtubeLink", :youtube_link, false, true, :string}, {"discogsReleaseId", :discogs_release_id, false, true, :string}, {"createdAt", :created_at, false, false, :string}, {"updatedAt", :updated_at, false, false, :string}, {"xataVersion", :xata_version, false, true, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.AlbumViewDetailed do
  @enforce_keys []
  defstruct [:id, :uri, :title, :artist, :artist_uri, :year, :album_art, :release_date, :sha256, :play_count, :unique_listeners, :tags, :tracks, :discogs, :created_at, :apple_music_link, :spotify_link, :tidal_link, :youtube_link, :discogs_release_id, :updated_at, :xata_version]
  @type t :: %__MODULE__{id: String.t() | nil, uri: String.t() | nil, title: String.t() | nil, artist: String.t() | nil, artist_uri: String.t() | nil, year: integer() | nil, album_art: String.t() | nil, release_date: String.t() | nil, sha256: String.t() | nil, play_count: integer() | nil, unique_listeners: integer() | nil, tags: [String.t()] | nil, tracks: [Rocksky.Models.SongViewBasic.t()] | nil, discogs: Rocksky.Models.AlbumDiscogsView.t() | nil, created_at: String.t() | nil, apple_music_link: String.t() | nil, spotify_link: String.t() | nil, tidal_link: String.t() | nil, youtube_link: String.t() | nil, discogs_release_id: String.t() | nil, updated_at: String.t() | nil, xata_version: integer() | nil}
  def __schema__, do: [{"id", :id, false, false, :string}, {"uri", :uri, false, true, :string}, {"title", :title, false, false, :string}, {"artist", :artist, false, false, :string}, {"artistUri", :artist_uri, false, true, :string}, {"year", :year, false, true, :integer}, {"albumArt", :album_art, false, true, :string}, {"releaseDate", :release_date, false, true, :string}, {"sha256", :sha256, false, false, :string}, {"playCount", :play_count, false, false, :integer}, {"uniqueListeners", :unique_listeners, false, false, :integer}, {"tags", :tags, false, false, {:list, :string}}, {"tracks", :tracks, false, false, {:list, {:record, Rocksky.Models.SongViewBasic}}}, {"discogs", :discogs, false, false, {:record, Rocksky.Models.AlbumDiscogsView}}, {"createdAt", :created_at, false, false, :string}, {"appleMusicLink", :apple_music_link, false, true, :string}, {"spotifyLink", :spotify_link, false, true, :string}, {"tidalLink", :tidal_link, false, true, :string}, {"youtubeLink", :youtube_link, false, true, :string}, {"discogsReleaseId", :discogs_release_id, false, true, :string}, {"updatedAt", :updated_at, false, false, :string}, {"xataVersion", :xata_version, false, true, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.ApiKeyView do
  @enforce_keys []
  defstruct [:id, :name, :description, :created_at]
  @type t :: %__MODULE__{id: String.t() | nil, name: String.t() | nil, description: String.t() | nil, created_at: String.t() | nil}
  def __schema__, do: [{"id", :id, false, false, :string}, {"name", :name, false, false, :string}, {"description", :description, false, false, :string}, {"createdAt", :created_at, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.ArtistGetArtistParams do
  @enforce_keys [:uri]
  defstruct [:uri]
  @type t :: %__MODULE__{uri: String.t()}
  def __schema__, do: [{"uri", :uri, true, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.ArtistGetArtistsOutput do
  @enforce_keys []
  defstruct [:artists]
  @type t :: %__MODULE__{artists: [Rocksky.Models.ArtistViewBasic.t()] | nil}
  def __schema__, do: [{"artists", :artists, false, false, {:list, {:record, Rocksky.Models.ArtistViewBasic}}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.ArtistGetArtistsParams do
  @enforce_keys []
  defstruct [:limit, :offset, :names, :genre, :filter]
  @type t :: %__MODULE__{limit: integer() | nil, offset: integer() | nil, names: String.t() | nil, genre: String.t() | nil, filter: String.t() | nil}
  def __schema__, do: [{"limit", :limit, false, false, :integer}, {"offset", :offset, false, false, :integer}, {"names", :names, false, false, :string}, {"genre", :genre, false, false, :string}, {"filter", :filter, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.ArtistListenerViewBasic do
  @enforce_keys []
  defstruct [:id, :did, :handle, :display_name, :avatar, :most_listened_song, :total_plays, :rank]
  @type t :: %__MODULE__{id: String.t() | nil, did: String.t() | nil, handle: String.t() | nil, display_name: String.t() | nil, avatar: String.t() | nil, most_listened_song: Rocksky.Models.ArtistSongViewBasic.t() | nil, total_plays: integer() | nil, rank: integer() | nil}
  def __schema__, do: [{"id", :id, false, false, :string}, {"did", :did, false, false, :string}, {"handle", :handle, false, false, :string}, {"displayName", :display_name, false, false, :string}, {"avatar", :avatar, false, false, :string}, {"mostListenedSong", :most_listened_song, false, false, {:record, Rocksky.Models.ArtistSongViewBasic}}, {"totalPlays", :total_plays, false, false, :integer}, {"rank", :rank, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.ArtistMbid do
  @enforce_keys []
  defstruct [:mbid, :name]
  @type t :: %__MODULE__{mbid: String.t() | nil, name: String.t() | nil}
  def __schema__, do: [{"mbid", :mbid, false, false, :string}, {"name", :name, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.ArtistRecentListenerView do
  @enforce_keys []
  defstruct [:id, :did, :handle, :display_name, :avatar, :timestamp, :scrobble_uri]
  @type t :: %__MODULE__{id: String.t() | nil, did: String.t() | nil, handle: String.t() | nil, display_name: String.t() | nil, avatar: String.t() | nil, timestamp: String.t() | nil, scrobble_uri: String.t() | nil}
  def __schema__, do: [{"id", :id, false, false, :string}, {"did", :did, false, false, :string}, {"handle", :handle, false, false, :string}, {"displayName", :display_name, false, false, :string}, {"avatar", :avatar, false, false, :string}, {"timestamp", :timestamp, false, false, :string}, {"scrobbleUri", :scrobble_uri, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.ArtistRecord do
  @enforce_keys [:name, :created_at]
  defstruct [:name, :bio, :picture, :picture_url, :tags, :born, :died, :born_in, :created_at]
  @type t :: %__MODULE__{name: String.t(), bio: String.t() | nil, picture: Rocksky.Models.BlobRef.t() | nil, picture_url: String.t() | nil, tags: [String.t()] | nil, born: String.t() | nil, died: String.t() | nil, born_in: String.t() | nil, created_at: String.t()}
  def __schema__, do: [{"name", :name, true, false, :string}, {"bio", :bio, false, false, :string}, {"picture", :picture, false, false, {:record, Rocksky.Models.BlobRef}}, {"pictureUrl", :picture_url, false, false, :string}, {"tags", :tags, false, false, {:list, :string}}, {"born", :born, false, false, :string}, {"died", :died, false, false, :string}, {"bornIn", :born_in, false, false, :string}, {"createdAt", :created_at, true, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.ArtistSongViewBasic do
  @enforce_keys []
  defstruct [:uri, :title, :play_count]
  @type t :: %__MODULE__{uri: String.t() | nil, title: String.t() | nil, play_count: integer() | nil}
  def __schema__, do: [{"uri", :uri, false, false, :string}, {"title", :title, false, false, :string}, {"playCount", :play_count, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.ArtistViewBasic do
  @enforce_keys []
  defstruct [:id, :uri, :name, :picture, :sha256, :play_count, :unique_listeners, :tags, :created_at, :updated_at, :biography, :born, :born_in, :died, :apple_music_link, :spotify_link, :tidal_link, :youtube_link, :genres, :xata_version]
  @type t :: %__MODULE__{id: String.t() | nil, uri: String.t() | nil, name: String.t() | nil, picture: String.t() | nil, sha256: String.t() | nil, play_count: integer() | nil, unique_listeners: integer() | nil, tags: [String.t()] | nil, created_at: String.t() | nil, updated_at: String.t() | nil, biography: String.t() | nil, born: String.t() | nil, born_in: String.t() | nil, died: String.t() | nil, apple_music_link: String.t() | nil, spotify_link: String.t() | nil, tidal_link: String.t() | nil, youtube_link: String.t() | nil, genres: [String.t()] | nil, xata_version: integer() | nil}
  def __schema__, do: [{"id", :id, false, false, :string}, {"uri", :uri, false, true, :string}, {"name", :name, false, false, :string}, {"picture", :picture, false, true, :string}, {"sha256", :sha256, false, false, :string}, {"playCount", :play_count, false, false, :integer}, {"uniqueListeners", :unique_listeners, false, false, :integer}, {"tags", :tags, false, false, {:list, :string}}, {"createdAt", :created_at, false, false, :string}, {"updatedAt", :updated_at, false, false, :string}, {"biography", :biography, false, true, :string}, {"born", :born, false, true, :string}, {"bornIn", :born_in, false, true, :string}, {"died", :died, false, true, :string}, {"appleMusicLink", :apple_music_link, false, true, :string}, {"spotifyLink", :spotify_link, false, true, :string}, {"tidalLink", :tidal_link, false, true, :string}, {"youtubeLink", :youtube_link, false, true, :string}, {"genres", :genres, false, true, {:list, :string}}, {"xataVersion", :xata_version, false, true, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.ArtistViewDetailed do
  @enforce_keys []
  defstruct [:id, :uri, :name, :picture, :sha256, :play_count, :unique_listeners, :tags, :created_at, :updated_at, :biography, :born, :born_in, :died, :apple_music_link, :spotify_link, :tidal_link, :youtube_link, :genres, :xata_version]
  @type t :: %__MODULE__{id: String.t() | nil, uri: String.t() | nil, name: String.t() | nil, picture: String.t() | nil, sha256: String.t() | nil, play_count: integer() | nil, unique_listeners: integer() | nil, tags: [String.t()] | nil, created_at: String.t() | nil, updated_at: String.t() | nil, biography: String.t() | nil, born: String.t() | nil, born_in: String.t() | nil, died: String.t() | nil, apple_music_link: String.t() | nil, spotify_link: String.t() | nil, tidal_link: String.t() | nil, youtube_link: String.t() | nil, genres: [String.t()] | nil, xata_version: integer() | nil}
  def __schema__, do: [{"id", :id, false, false, :string}, {"uri", :uri, false, true, :string}, {"name", :name, false, false, :string}, {"picture", :picture, false, true, :string}, {"sha256", :sha256, false, false, :string}, {"playCount", :play_count, false, false, :integer}, {"uniqueListeners", :unique_listeners, false, false, :integer}, {"tags", :tags, false, false, {:list, :string}}, {"createdAt", :created_at, false, false, :string}, {"updatedAt", :updated_at, false, false, :string}, {"biography", :biography, false, true, :string}, {"born", :born, false, true, :string}, {"bornIn", :born_in, false, true, :string}, {"died", :died, false, true, :string}, {"appleMusicLink", :apple_music_link, false, true, :string}, {"spotifyLink", :spotify_link, false, true, :string}, {"tidalLink", :tidal_link, false, true, :string}, {"youtubeLink", :youtube_link, false, true, :string}, {"genres", :genres, false, true, {:list, :string}}, {"xataVersion", :xata_version, false, true, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.ChartsDecadeViewBasic do
  @enforce_keys []
  defstruct [:decade, :scrobbles, :unique_albums]
  @type t :: %__MODULE__{decade: integer() | nil, scrobbles: integer() | nil, unique_albums: integer() | nil}
  def __schema__, do: [{"decade", :decade, false, false, :integer}, {"scrobbles", :scrobbles, false, false, :integer}, {"uniqueAlbums", :unique_albums, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.ChartsScrobblerViewBasic do
  @enforce_keys []
  defstruct [:id, :did, :handle, :display_name, :avatar, :scrobbles, :unique_artists, :unique_tracks]
  @type t :: %__MODULE__{id: String.t() | nil, did: String.t() | nil, handle: String.t() | nil, display_name: String.t() | nil, avatar: String.t() | nil, scrobbles: integer() | nil, unique_artists: integer() | nil, unique_tracks: integer() | nil}
  def __schema__, do: [{"id", :id, false, false, :string}, {"did", :did, false, false, :string}, {"handle", :handle, false, false, :string}, {"displayName", :display_name, false, false, :string}, {"avatar", :avatar, false, false, :string}, {"scrobbles", :scrobbles, false, false, :integer}, {"uniqueArtists", :unique_artists, false, false, :integer}, {"uniqueTracks", :unique_tracks, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.ChartsScrobbleViewBasic do
  @enforce_keys []
  defstruct [:date, :count]
  @type t :: %__MODULE__{date: String.t() | nil, count: integer() | nil}
  def __schema__, do: [{"date", :date, false, false, :string}, {"count", :count, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.ChartsView do
  @enforce_keys []
  defstruct [:scrobbles]
  @type t :: %__MODULE__{scrobbles: [Rocksky.Models.ChartsScrobbleViewBasic.t()] | nil}
  def __schema__, do: [{"scrobbles", :scrobbles, false, false, {:list, {:record, Rocksky.Models.ChartsScrobbleViewBasic}}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.CreateApikeyInput do
  @enforce_keys [:name]
  defstruct [:name, :description]
  @type t :: %__MODULE__{name: String.t(), description: String.t() | nil}
  def __schema__, do: [{"name", :name, true, false, :string}, {"description", :description, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.CreateScrobbleInput do
  @enforce_keys [:title, :artist]
  defstruct [:title, :artist, :album, :duration, :mb_id, :isrc, :album_art, :track_number, :release_date, :year, :disc_number, :lyrics, :composer, :copyright_message, :label, :artist_picture, :spotify_link, :lastfm_link, :tidal_link, :apple_music_link, :youtube_link, :deezer_link, :timestamp]
  @type t :: %__MODULE__{title: String.t(), artist: String.t(), album: String.t() | nil, duration: integer() | nil, mb_id: String.t() | nil, isrc: String.t() | nil, album_art: String.t() | nil, track_number: integer() | nil, release_date: String.t() | nil, year: integer() | nil, disc_number: integer() | nil, lyrics: String.t() | nil, composer: String.t() | nil, copyright_message: String.t() | nil, label: String.t() | nil, artist_picture: String.t() | nil, spotify_link: String.t() | nil, lastfm_link: String.t() | nil, tidal_link: String.t() | nil, apple_music_link: String.t() | nil, youtube_link: String.t() | nil, deezer_link: String.t() | nil, timestamp: integer() | nil}
  def __schema__, do: [{"title", :title, true, false, :string}, {"artist", :artist, true, false, :string}, {"album", :album, false, false, :string}, {"duration", :duration, false, false, :integer}, {"mbId", :mb_id, false, false, :string}, {"isrc", :isrc, false, false, :string}, {"albumArt", :album_art, false, false, :string}, {"trackNumber", :track_number, false, false, :integer}, {"releaseDate", :release_date, false, false, :string}, {"year", :year, false, false, :integer}, {"discNumber", :disc_number, false, false, :integer}, {"lyrics", :lyrics, false, false, :string}, {"composer", :composer, false, false, :string}, {"copyrightMessage", :copyright_message, false, false, :string}, {"label", :label, false, false, :string}, {"artistPicture", :artist_picture, false, false, :string}, {"spotifyLink", :spotify_link, false, false, :string}, {"lastfmLink", :lastfm_link, false, false, :string}, {"tidalLink", :tidal_link, false, false, :string}, {"appleMusicLink", :apple_music_link, false, false, :string}, {"youtubeLink", :youtube_link, false, false, :string}, {"deezerLink", :deezer_link, false, false, :string}, {"timestamp", :timestamp, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.CreateShoutInput do
  @enforce_keys []
  defstruct [:message]
  @type t :: %__MODULE__{message: String.t() | nil}
  def __schema__, do: [{"message", :message, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.CreateSongInput do
  @enforce_keys [:title, :artist, :album_artist, :album]
  defstruct [:title, :artist, :album_artist, :album, :duration, :mb_id, :isrc, :album_art, :track_number, :release_date, :year, :disc_number, :lyrics]
  @type t :: %__MODULE__{title: String.t(), artist: String.t(), album_artist: String.t(), album: String.t(), duration: integer() | nil, mb_id: String.t() | nil, isrc: String.t() | nil, album_art: String.t() | nil, track_number: integer() | nil, release_date: String.t() | nil, year: integer() | nil, disc_number: integer() | nil, lyrics: String.t() | nil}
  def __schema__, do: [{"title", :title, true, false, :string}, {"artist", :artist, true, false, :string}, {"albumArtist", :album_artist, true, false, :string}, {"album", :album, true, false, :string}, {"duration", :duration, false, false, :integer}, {"mbId", :mb_id, false, false, :string}, {"isrc", :isrc, false, false, :string}, {"albumArt", :album_art, false, false, :string}, {"trackNumber", :track_number, false, false, :integer}, {"releaseDate", :release_date, false, false, :string}, {"year", :year, false, false, :integer}, {"discNumber", :disc_number, false, false, :integer}, {"lyrics", :lyrics, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.DeleteAlbumInput do
  @enforce_keys [:id]
  defstruct [:id]
  @type t :: %__MODULE__{id: String.t()}
  def __schema__, do: [{"id", :id, true, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.DeleteAlbumOutput do
  @enforce_keys [:status, :deleted]
  defstruct [:status, :deleted]
  @type t :: %__MODULE__{status: String.t(), deleted: integer()}
  def __schema__, do: [{"status", :status, true, false, :string}, {"deleted", :deleted, true, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.DeletePlaylistInput do
  @enforce_keys [:id]
  defstruct [:id]
  @type t :: %__MODULE__{id: String.t()}
  def __schema__, do: [{"id", :id, true, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.DeletePlaylistOutput do
  @enforce_keys []
  defstruct [:status, :version, :type, :server_version, :open_subsonic, :atproto_error]
  @type t :: %__MODULE__{status: String.t() | nil, version: String.t() | nil, type: String.t() | nil, server_version: String.t() | nil, open_subsonic: boolean() | nil, atproto_error: String.t() | nil}
  def __schema__, do: [{"status", :status, false, false, :string}, {"version", :version, false, false, :string}, {"type", :type, false, false, :string}, {"serverVersion", :server_version, false, false, :string}, {"openSubsonic", :open_subsonic, false, false, :boolean}, {"atprotoError", :atproto_error, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.DeletePresetParams do
  @enforce_keys [:rkey]
  defstruct [:rkey]
  @type t :: %__MODULE__{rkey: String.t()}
  def __schema__, do: [{"rkey", :rkey, true, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.DeleteSongInput do
  @enforce_keys [:id]
  defstruct [:id]
  @type t :: %__MODULE__{id: String.t()}
  def __schema__, do: [{"id", :id, true, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.DeleteSongOutput do
  @enforce_keys [:status, :deleted]
  defstruct [:status, :deleted]
  @type t :: %__MODULE__{status: String.t(), deleted: integer()}
  def __schema__, do: [{"status", :status, true, false, :string}, {"deleted", :deleted, true, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.DescribeFeedGeneratorOutput do
  @enforce_keys []
  defstruct [:did, :feeds]
  @type t :: %__MODULE__{did: String.t() | nil, feeds: [Rocksky.Models.FeedUriView.t()] | nil}
  def __schema__, do: [{"did", :did, false, false, :string}, {"feeds", :feeds, false, false, {:list, {:record, Rocksky.Models.FeedUriView}}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.DislikeShoutInput do
  @enforce_keys []
  defstruct [:uri]
  @type t :: %__MODULE__{uri: String.t() | nil}
  def __schema__, do: [{"uri", :uri, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.DislikeSongInput do
  @enforce_keys []
  defstruct [:uri]
  @type t :: %__MODULE__{uri: String.t() | nil}
  def __schema__, do: [{"uri", :uri, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.DropboxDownloadFileParams do
  @enforce_keys [:file_id]
  defstruct [:file_id]
  @type t :: %__MODULE__{file_id: String.t()}
  def __schema__, do: [{"fileId", :file_id, true, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.DropboxFileListView do
  @enforce_keys []
  defstruct [:files, :directory, :parent_directory, :directories]
  @type t :: %__MODULE__{files: [Rocksky.Models.DropboxFileView.t()] | nil, directory: Rocksky.Models.DropboxResponseDirectoryView.t() | nil, parent_directory: Rocksky.Models.DropboxResponseParentDirectoryView.t() | nil, directories: [Rocksky.Models.DropboxResponseDirectoriesItemView.t()] | nil}
  def __schema__, do: [{"files", :files, false, false, {:list, {:record, Rocksky.Models.DropboxFileView}}}, {"directory", :directory, false, false, {:record, Rocksky.Models.DropboxResponseDirectoryView}}, {"parentDirectory", :parent_directory, false, false, {:record, Rocksky.Models.DropboxResponseParentDirectoryView}}, {"directories", :directories, false, false, {:list, {:record, Rocksky.Models.DropboxResponseDirectoriesItemView}}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.DropboxFileView do
  @enforce_keys []
  defstruct [:id, :name, :path_lower, :path_display, :client_modified, :server_modified, :file_id, :directory_id, :track_id, :created_at, :updated_at]
  @type t :: %__MODULE__{id: String.t() | nil, name: String.t() | nil, path_lower: String.t() | nil, path_display: String.t() | nil, client_modified: String.t() | nil, server_modified: String.t() | nil, file_id: String.t() | nil, directory_id: String.t() | nil, track_id: String.t() | nil, created_at: String.t() | nil, updated_at: String.t() | nil}
  def __schema__, do: [{"id", :id, false, false, :string}, {"name", :name, false, false, :string}, {"pathLower", :path_lower, false, false, :string}, {"pathDisplay", :path_display, false, false, :string}, {"clientModified", :client_modified, false, false, :string}, {"serverModified", :server_modified, false, false, :string}, {"fileId", :file_id, false, false, :string}, {"directoryId", :directory_id, false, false, :string}, {"trackId", :track_id, false, false, :string}, {"createdAt", :created_at, false, false, :string}, {"updatedAt", :updated_at, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.DropboxGetFilesParams do
  @enforce_keys []
  defstruct [:at]
  @type t :: %__MODULE__{at: String.t() | nil}
  def __schema__, do: [{"at", :at, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.DropboxResponseDirectoriesItemView do
  @enforce_keys []
  defstruct [:id, :name, :file_id, :path, :parent_id, :created_at, :updated_at]
  @type t :: %__MODULE__{id: String.t() | nil, name: String.t() | nil, file_id: String.t() | nil, path: String.t() | nil, parent_id: String.t() | nil, created_at: String.t() | nil, updated_at: String.t() | nil}
  def __schema__, do: [{"id", :id, false, false, :string}, {"name", :name, false, false, :string}, {"fileId", :file_id, false, false, :string}, {"path", :path, false, false, :string}, {"parentId", :parent_id, false, false, :string}, {"createdAt", :created_at, false, false, :string}, {"updatedAt", :updated_at, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.DropboxResponseDirectoryView do
  @enforce_keys []
  defstruct []
  @type t :: %__MODULE__{}
  def __schema__, do: []
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.DropboxResponseParentDirectoryView do
  @enforce_keys []
  defstruct []
  @type t :: %__MODULE__{}
  def __schema__, do: []
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.DropboxTemporaryLinkView do
  @enforce_keys []
  defstruct [:link]
  @type t :: %__MODULE__{link: String.t() | nil}
  def __schema__, do: [{"link", :link, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.EqualizerPresetView do
  @enforce_keys [:uri, :rkey, :name, :bands, :created_at]
  defstruct [:uri, :rkey, :name, :precut, :bands, :created_at, :updated_at]
  @type t :: %__MODULE__{uri: String.t(), rkey: String.t(), name: String.t(), precut: integer() | nil, bands: [Rocksky.Models.RockboxEqualizerBand.t()], created_at: String.t(), updated_at: String.t() | nil}
  def __schema__, do: [{"uri", :uri, true, false, :string}, {"rkey", :rkey, true, false, :string}, {"name", :name, true, false, :string}, {"precut", :precut, false, false, :integer}, {"bands", :bands, true, false, {:list, {:record, Rocksky.Models.RockboxEqualizerBand}}}, {"createdAt", :created_at, true, false, :string}, {"updatedAt", :updated_at, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.EqualizerRecord do
  @enforce_keys [:name, :bands, :created_at]
  defstruct [:name, :precut, :bands, :created_at, :updated_at]
  @type t :: %__MODULE__{name: String.t(), precut: integer() | nil, bands: [Rocksky.Models.RockboxEqualizerBand.t()], created_at: String.t(), updated_at: String.t() | nil}
  def __schema__, do: [{"name", :name, true, false, :string}, {"precut", :precut, false, false, :integer}, {"bands", :bands, true, false, {:list, {:record, Rocksky.Models.RockboxEqualizerBand}}}, {"createdAt", :created_at, true, false, :string}, {"updatedAt", :updated_at, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.FeedGeneratorsView do
  @enforce_keys []
  defstruct [:feeds]
  @type t :: %__MODULE__{feeds: [Rocksky.Models.FeedGeneratorView.t()] | nil}
  def __schema__, do: [{"feeds", :feeds, false, false, {:list, {:record, Rocksky.Models.FeedGeneratorView}}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.FeedGeneratorView do
  @enforce_keys []
  defstruct [:id, :name, :description, :uri, :avatar, :creator, :did]
  @type t :: %__MODULE__{id: String.t() | nil, name: String.t() | nil, description: String.t() | nil, uri: String.t() | nil, avatar: String.t() | nil, creator: Rocksky.Models.ActorProfileViewBasic.t() | nil, did: String.t() | nil}
  def __schema__, do: [{"id", :id, false, false, :string}, {"name", :name, false, false, :string}, {"description", :description, false, true, :string}, {"uri", :uri, false, false, :string}, {"avatar", :avatar, false, true, :string}, {"creator", :creator, false, false, {:record, Rocksky.Models.ActorProfileViewBasic}}, {"did", :did, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.FeedItemView do
  @enforce_keys []
  defstruct [:scrobble]
  @type t :: %__MODULE__{scrobble: Rocksky.Models.ScrobbleViewBasic.t() | nil}
  def __schema__, do: [{"scrobble", :scrobble, false, false, {:record, Rocksky.Models.ScrobbleViewBasic}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.FeedRecommendationsView do
  @enforce_keys []
  defstruct [:recommendations, :cursor]
  @type t :: %__MODULE__{recommendations: [Rocksky.Models.FeedRecommendationView.t()] | nil, cursor: String.t() | nil}
  def __schema__, do: [{"recommendations", :recommendations, false, false, {:list, {:record, Rocksky.Models.FeedRecommendationView}}}, {"cursor", :cursor, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.FeedRecommendationView do
  @enforce_keys []
  defstruct [:title, :artist, :album, :album_art, :track_uri, :artist_uri, :album_uri, :genres, :source, :likes_count, :recommendation_score]
  @type t :: %__MODULE__{title: String.t() | nil, artist: String.t() | nil, album: String.t() | nil, album_art: String.t() | nil, track_uri: String.t() | nil, artist_uri: String.t() | nil, album_uri: String.t() | nil, genres: [String.t()] | nil, source: String.t() | nil, likes_count: integer() | nil, recommendation_score: float() | nil}
  def __schema__, do: [{"title", :title, false, false, :string}, {"artist", :artist, false, false, :string}, {"album", :album, false, false, :string}, {"albumArt", :album_art, false, false, :string}, {"trackUri", :track_uri, false, false, :string}, {"artistUri", :artist_uri, false, false, :string}, {"albumUri", :album_uri, false, false, :string}, {"genres", :genres, false, false, {:list, :string}}, {"source", :source, false, false, :string}, {"likesCount", :likes_count, false, false, :integer}, {"recommendationScore", :recommendation_score, false, false, :float}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.FeedRecommendedAlbumsView do
  @enforce_keys []
  defstruct [:albums, :cursor]
  @type t :: %__MODULE__{albums: [Rocksky.Models.FeedRecommendedAlbumView.t()] | nil, cursor: String.t() | nil}
  def __schema__, do: [{"albums", :albums, false, false, {:list, {:record, Rocksky.Models.FeedRecommendedAlbumView}}}, {"cursor", :cursor, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.FeedRecommendedAlbumView do
  @enforce_keys []
  defstruct [:id, :uri, :title, :artist, :artist_uri, :year, :album_art, :source, :recommendation_score]
  @type t :: %__MODULE__{id: String.t() | nil, uri: String.t() | nil, title: String.t() | nil, artist: String.t() | nil, artist_uri: String.t() | nil, year: integer() | nil, album_art: String.t() | nil, source: String.t() | nil, recommendation_score: float() | nil}
  def __schema__, do: [{"id", :id, false, false, :string}, {"uri", :uri, false, false, :string}, {"title", :title, false, false, :string}, {"artist", :artist, false, false, :string}, {"artistUri", :artist_uri, false, false, :string}, {"year", :year, false, false, :integer}, {"albumArt", :album_art, false, false, :string}, {"source", :source, false, false, :string}, {"recommendationScore", :recommendation_score, false, false, :float}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.FeedRecommendedArtistsView do
  @enforce_keys []
  defstruct [:artists, :cursor]
  @type t :: %__MODULE__{artists: [Rocksky.Models.FeedRecommendedArtistView.t()] | nil, cursor: String.t() | nil}
  def __schema__, do: [{"artists", :artists, false, false, {:list, {:record, Rocksky.Models.FeedRecommendedArtistView}}}, {"cursor", :cursor, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.FeedRecommendedArtistView do
  @enforce_keys []
  defstruct [:id, :uri, :name, :picture, :genres, :source, :recommendation_score]
  @type t :: %__MODULE__{id: String.t() | nil, uri: String.t() | nil, name: String.t() | nil, picture: String.t() | nil, genres: [String.t()] | nil, source: String.t() | nil, recommendation_score: float() | nil}
  def __schema__, do: [{"id", :id, false, false, :string}, {"uri", :uri, false, false, :string}, {"name", :name, false, false, :string}, {"picture", :picture, false, false, :string}, {"genres", :genres, false, false, {:list, :string}}, {"source", :source, false, false, :string}, {"recommendationScore", :recommendation_score, false, false, :float}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.FeedSearchFederation do
  @enforce_keys []
  defstruct [:index_uid]
  @type t :: %__MODULE__{index_uid: String.t() | nil}
  def __schema__, do: [{"indexUid", :index_uid, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.FeedSearchHit do
  @enforce_keys []
  defstruct [:id, :title, :artist, :album_artist, :album_art, :uri, :album, :duration, :track_number, :disc_number, :play_count, :likes_count, :liked, :unique_listeners, :album_uri, :artist_uri, :sha256, :mbid, :isrc, :tags, :created_at, :updated_at, :mb_id, :youtube_link, :spotify_link, :apple_music_link, :tidal_link, :lyrics, :composer, :genre, :label, :copyright_message, :key, :acoustid_fingerprint, :xata_version, :year, :release_date, :discogs_release_id, :name, :picture, :biography, :born, :born_in, :died, :genres, :curator_did, :curator_handle, :curator_name, :curator_avatar_url, :description, :cover_image_url, :track_count, :track_arts, :curator_d_id, :did, :handle, :display_name, :avatar, :federation, :bpm]
  @type t :: %__MODULE__{id: String.t() | nil, title: String.t() | nil, artist: String.t() | nil, album_artist: String.t() | nil, album_art: String.t() | nil, uri: String.t() | nil, album: String.t() | nil, duration: integer() | nil, track_number: integer() | nil, disc_number: integer() | nil, play_count: integer() | nil, likes_count: integer() | nil, liked: boolean() | nil, unique_listeners: integer() | nil, album_uri: String.t() | nil, artist_uri: String.t() | nil, sha256: String.t() | nil, mbid: String.t() | nil, isrc: String.t() | nil, tags: [String.t()] | nil, created_at: String.t() | nil, updated_at: String.t() | nil, mb_id: String.t() | nil, youtube_link: String.t() | nil, spotify_link: String.t() | nil, apple_music_link: String.t() | nil, tidal_link: String.t() | nil, lyrics: String.t() | nil, composer: String.t() | nil, genre: String.t() | nil, label: String.t() | nil, copyright_message: String.t() | nil, key: String.t() | nil, acoustid_fingerprint: String.t() | nil, xata_version: integer() | nil, year: integer() | nil, release_date: String.t() | nil, discogs_release_id: String.t() | nil, name: String.t() | nil, picture: String.t() | nil, biography: String.t() | nil, born: String.t() | nil, born_in: String.t() | nil, died: String.t() | nil, genres: [String.t()] | nil, curator_did: String.t() | nil, curator_handle: String.t() | nil, curator_name: String.t() | nil, curator_avatar_url: String.t() | nil, description: String.t() | nil, cover_image_url: String.t() | nil, track_count: integer() | nil, track_arts: [String.t()] | nil, curator_d_id: String.t() | nil, did: String.t() | nil, handle: String.t() | nil, display_name: String.t() | nil, avatar: String.t() | nil, federation: Rocksky.Models.FeedSearchFederation.t() | nil, bpm: float() | nil}
  def __schema__, do: [{"id", :id, false, false, :string}, {"title", :title, false, false, :string}, {"artist", :artist, false, false, :string}, {"albumArtist", :album_artist, false, false, :string}, {"albumArt", :album_art, false, true, :string}, {"uri", :uri, false, true, :string}, {"album", :album, false, false, :string}, {"duration", :duration, false, false, :integer}, {"trackNumber", :track_number, false, true, :integer}, {"discNumber", :disc_number, false, true, :integer}, {"playCount", :play_count, false, false, :integer}, {"likesCount", :likes_count, false, false, :integer}, {"liked", :liked, false, false, :boolean}, {"uniqueListeners", :unique_listeners, false, false, :integer}, {"albumUri", :album_uri, false, true, :string}, {"artistUri", :artist_uri, false, true, :string}, {"sha256", :sha256, false, false, :string}, {"mbid", :mbid, false, false, :string}, {"isrc", :isrc, false, true, :string}, {"tags", :tags, false, false, {:list, :string}}, {"createdAt", :created_at, false, false, :string}, {"updatedAt", :updated_at, false, false, :string}, {"mbId", :mb_id, false, true, :string}, {"youtubeLink", :youtube_link, false, true, :string}, {"spotifyLink", :spotify_link, false, true, :string}, {"appleMusicLink", :apple_music_link, false, true, :string}, {"tidalLink", :tidal_link, false, true, :string}, {"lyrics", :lyrics, false, true, :string}, {"composer", :composer, false, true, :string}, {"genre", :genre, false, true, :string}, {"label", :label, false, true, :string}, {"copyrightMessage", :copyright_message, false, true, :string}, {"key", :key, false, true, :string}, {"acoustidFingerprint", :acoustid_fingerprint, false, true, :string}, {"xataVersion", :xata_version, false, true, :integer}, {"year", :year, false, true, :integer}, {"releaseDate", :release_date, false, true, :string}, {"discogsReleaseId", :discogs_release_id, false, true, :string}, {"name", :name, false, false, :string}, {"picture", :picture, false, true, :string}, {"biography", :biography, false, true, :string}, {"born", :born, false, true, :string}, {"bornIn", :born_in, false, true, :string}, {"died", :died, false, true, :string}, {"genres", :genres, false, true, {:list, :string}}, {"curatorDid", :curator_did, false, false, :string}, {"curatorHandle", :curator_handle, false, false, :string}, {"curatorName", :curator_name, false, false, :string}, {"curatorAvatarUrl", :curator_avatar_url, false, false, :string}, {"description", :description, false, false, :string}, {"coverImageUrl", :cover_image_url, false, true, :string}, {"trackCount", :track_count, false, false, :integer}, {"trackArts", :track_arts, false, false, {:list, :string}}, {"curatorDId", :curator_d_id, false, false, :string}, {"did", :did, false, false, :string}, {"handle", :handle, false, false, :string}, {"displayName", :display_name, false, true, :string}, {"avatar", :avatar, false, true, :string}, {"_federation", :federation, false, false, {:record, Rocksky.Models.FeedSearchFederation}}, {"bpm", :bpm, false, false, :float}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.FeedSearchParams do
  @enforce_keys [:query]
  defstruct [:query]
  @type t :: %__MODULE__{query: String.t()}
  def __schema__, do: [{"query", :query, true, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.FeedSearchResultsView do
  @enforce_keys []
  defstruct [:hits, :processing_time_ms, :limit, :offset, :estimated_total_hits]
  @type t :: %__MODULE__{hits: [Rocksky.Models.FeedSearchHit.t()] | nil, processing_time_ms: integer() | nil, limit: integer() | nil, offset: integer() | nil, estimated_total_hits: integer() | nil}
  def __schema__, do: [{"hits", :hits, false, false, {:list, {:record, Rocksky.Models.FeedSearchHit}}}, {"processingTimeMs", :processing_time_ms, false, false, :integer}, {"limit", :limit, false, false, :integer}, {"offset", :offset, false, false, :integer}, {"estimatedTotalHits", :estimated_total_hits, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.FeedStoriesView do
  @enforce_keys []
  defstruct [:stories]
  @type t :: %__MODULE__{stories: [Rocksky.Models.FeedStoryView.t()] | nil}
  def __schema__, do: [{"stories", :stories, false, false, {:list, {:record, Rocksky.Models.FeedStoryView}}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.FeedStoryView do
  @enforce_keys []
  defstruct [:album, :album_art, :album_artist, :album_uri, :artist, :artist_uri, :avatar, :created_at, :did, :handle, :id, :title, :track_id, :track_uri, :uri, :liked, :likes_count]
  @type t :: %__MODULE__{album: String.t() | nil, album_art: String.t() | nil, album_artist: String.t() | nil, album_uri: String.t() | nil, artist: String.t() | nil, artist_uri: String.t() | nil, avatar: String.t() | nil, created_at: String.t() | nil, did: String.t() | nil, handle: String.t() | nil, id: String.t() | nil, title: String.t() | nil, track_id: String.t() | nil, track_uri: String.t() | nil, uri: String.t() | nil, liked: boolean() | nil, likes_count: integer() | nil}
  def __schema__, do: [{"album", :album, false, false, :string}, {"albumArt", :album_art, false, false, :string}, {"albumArtist", :album_artist, false, false, :string}, {"albumUri", :album_uri, false, false, :string}, {"artist", :artist, false, false, :string}, {"artistUri", :artist_uri, false, false, :string}, {"avatar", :avatar, false, false, :string}, {"createdAt", :created_at, false, false, :string}, {"did", :did, false, false, :string}, {"handle", :handle, false, false, :string}, {"id", :id, false, false, :string}, {"title", :title, false, false, :string}, {"trackId", :track_id, false, false, :string}, {"trackUri", :track_uri, false, false, :string}, {"uri", :uri, false, false, :string}, {"liked", :liked, false, false, :boolean}, {"likesCount", :likes_count, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.FeedUriView do
  @enforce_keys []
  defstruct [:uri]
  @type t :: %__MODULE__{uri: String.t() | nil}
  def __schema__, do: [{"uri", :uri, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.FeedView do
  @enforce_keys []
  defstruct [:feed, :cursor, :scrobbles]
  @type t :: %__MODULE__{feed: [Rocksky.Models.FeedItemView.t()] | nil, cursor: String.t() | nil, scrobbles: [Rocksky.Models.ScrobbleViewBasic.t()] | nil}
  def __schema__, do: [{"feed", :feed, false, false, {:list, {:record, Rocksky.Models.FeedItemView}}}, {"cursor", :cursor, false, false, :string}, {"scrobbles", :scrobbles, false, false, {:list, {:record, Rocksky.Models.ScrobbleViewBasic}}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.FollowAccountOutput do
  @enforce_keys [:subject, :followers]
  defstruct [:subject, :followers, :cursor]
  @type t :: %__MODULE__{subject: Rocksky.Models.ActorProfileViewBasic.t(), followers: [Rocksky.Models.ActorProfileViewBasic.t()], cursor: String.t() | nil}
  def __schema__, do: [{"subject", :subject, true, false, {:record, Rocksky.Models.ActorProfileViewBasic}}, {"followers", :followers, true, false, {:list, {:record, Rocksky.Models.ActorProfileViewBasic}}}, {"cursor", :cursor, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.FollowAccountParams do
  @enforce_keys [:account]
  defstruct [:account]
  @type t :: %__MODULE__{account: String.t()}
  def __schema__, do: [{"account", :account, true, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.FollowRecord do
  @enforce_keys [:created_at, :subject]
  defstruct [:created_at, :subject, :via]
  @type t :: %__MODULE__{created_at: String.t(), subject: String.t(), via: Rocksky.Models.StrongRef.t() | nil}
  def __schema__, do: [{"createdAt", :created_at, true, false, :string}, {"subject", :subject, true, false, :string}, {"via", :via, false, false, {:record, Rocksky.Models.StrongRef}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GeneratorRecord do
  @enforce_keys [:did, :display_name, :created_at]
  defstruct [:did, :avatar, :display_name, :description, :created_at]
  @type t :: %__MODULE__{did: String.t(), avatar: Rocksky.Models.BlobRef.t() | nil, display_name: String.t(), description: String.t() | nil, created_at: String.t()}
  def __schema__, do: [{"did", :did, true, false, :string}, {"avatar", :avatar, false, false, {:record, Rocksky.Models.BlobRef}}, {"displayName", :display_name, true, false, :string}, {"description", :description, false, false, :string}, {"createdAt", :created_at, true, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetActorAlbumsOutput do
  @enforce_keys []
  defstruct [:albums]
  @type t :: %__MODULE__{albums: [Rocksky.Models.AlbumViewBasic.t()] | nil}
  def __schema__, do: [{"albums", :albums, false, false, {:list, {:record, Rocksky.Models.AlbumViewBasic}}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetActorAlbumsParams do
  @enforce_keys [:did]
  defstruct [:did, :limit, :offset, :start_date, :end_date]
  @type t :: %__MODULE__{did: String.t(), limit: integer() | nil, offset: integer() | nil, start_date: String.t() | nil, end_date: String.t() | nil}
  def __schema__, do: [{"did", :did, true, false, :string}, {"limit", :limit, false, false, :integer}, {"offset", :offset, false, false, :integer}, {"startDate", :start_date, false, false, :string}, {"endDate", :end_date, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetActorArtistsOutput do
  @enforce_keys []
  defstruct [:artists]
  @type t :: %__MODULE__{artists: [Rocksky.Models.ArtistViewBasic.t()] | nil}
  def __schema__, do: [{"artists", :artists, false, false, {:list, {:record, Rocksky.Models.ArtistViewBasic}}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetActorArtistsParams do
  @enforce_keys [:did]
  defstruct [:did, :limit, :offset, :start_date, :end_date]
  @type t :: %__MODULE__{did: String.t(), limit: integer() | nil, offset: integer() | nil, start_date: String.t() | nil, end_date: String.t() | nil}
  def __schema__, do: [{"did", :did, true, false, :string}, {"limit", :limit, false, false, :integer}, {"offset", :offset, false, false, :integer}, {"startDate", :start_date, false, false, :string}, {"endDate", :end_date, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetActorCompatibilityOutput do
  @enforce_keys []
  defstruct [:compatibility]
  @type t :: %__MODULE__{compatibility: Rocksky.Models.ActorCompatibilityViewBasic.t() | nil}
  def __schema__, do: [{"compatibility", :compatibility, false, true, {:record, Rocksky.Models.ActorCompatibilityViewBasic}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetActorCompatibilityParams do
  @enforce_keys [:did]
  defstruct [:did]
  @type t :: %__MODULE__{did: String.t()}
  def __schema__, do: [{"did", :did, true, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetActorLovedSongsOutput do
  @enforce_keys []
  defstruct [:tracks]
  @type t :: %__MODULE__{tracks: [Rocksky.Models.SongViewBasic.t()] | nil}
  def __schema__, do: [{"tracks", :tracks, false, false, {:list, {:record, Rocksky.Models.SongViewBasic}}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetActorLovedSongsParams do
  @enforce_keys [:did]
  defstruct [:did, :limit, :offset]
  @type t :: %__MODULE__{did: String.t(), limit: integer() | nil, offset: integer() | nil}
  def __schema__, do: [{"did", :did, true, false, :string}, {"limit", :limit, false, false, :integer}, {"offset", :offset, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetActorNeighboursOutput do
  @enforce_keys []
  defstruct [:neighbours]
  @type t :: %__MODULE__{neighbours: [Rocksky.Models.ActorNeighbourViewBasic.t()] | nil}
  def __schema__, do: [{"neighbours", :neighbours, false, false, {:list, {:record, Rocksky.Models.ActorNeighbourViewBasic}}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetActorNeighboursParams do
  @enforce_keys [:did]
  defstruct [:did]
  @type t :: %__MODULE__{did: String.t()}
  def __schema__, do: [{"did", :did, true, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetActorPlaylistsOutput do
  @enforce_keys []
  defstruct [:playlists]
  @type t :: %__MODULE__{playlists: [Rocksky.Models.PlaylistViewBasic.t()] | nil}
  def __schema__, do: [{"playlists", :playlists, false, false, {:list, {:record, Rocksky.Models.PlaylistViewBasic}}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetActorPlaylistsParams do
  @enforce_keys [:did]
  defstruct [:did, :limit, :offset, :filter]
  @type t :: %__MODULE__{did: String.t(), limit: integer() | nil, offset: integer() | nil, filter: String.t() | nil}
  def __schema__, do: [{"did", :did, true, false, :string}, {"limit", :limit, false, false, :integer}, {"offset", :offset, false, false, :integer}, {"filter", :filter, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetActorScrobblesOutput do
  @enforce_keys []
  defstruct [:scrobbles]
  @type t :: %__MODULE__{scrobbles: [Rocksky.Models.ScrobbleViewBasic.t()] | nil}
  def __schema__, do: [{"scrobbles", :scrobbles, false, false, {:list, {:record, Rocksky.Models.ScrobbleViewBasic}}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetActorScrobblesParams do
  @enforce_keys [:did]
  defstruct [:did, :limit, :offset]
  @type t :: %__MODULE__{did: String.t(), limit: integer() | nil, offset: integer() | nil}
  def __schema__, do: [{"did", :did, true, false, :string}, {"limit", :limit, false, false, :integer}, {"offset", :offset, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetActorSongsOutput do
  @enforce_keys []
  defstruct [:tracks]
  @type t :: %__MODULE__{tracks: [Rocksky.Models.SongViewBasic.t()] | nil}
  def __schema__, do: [{"tracks", :tracks, false, false, {:list, {:record, Rocksky.Models.SongViewBasic}}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetActorSongsParams do
  @enforce_keys [:did]
  defstruct [:did, :limit, :offset, :start_date, :end_date]
  @type t :: %__MODULE__{did: String.t(), limit: integer() | nil, offset: integer() | nil, start_date: String.t() | nil, end_date: String.t() | nil}
  def __schema__, do: [{"did", :did, true, false, :string}, {"limit", :limit, false, false, :integer}, {"offset", :offset, false, false, :integer}, {"startDate", :start_date, false, false, :string}, {"endDate", :end_date, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetAlbumInfoOutput do
  @enforce_keys []
  defstruct [:status, :version, :type, :server_version, :open_subsonic, :album_info]
  @type t :: %__MODULE__{status: String.t() | nil, version: String.t() | nil, type: String.t() | nil, server_version: String.t() | nil, open_subsonic: boolean() | nil, album_info: Rocksky.Codec.json_value() | nil}
  def __schema__, do: [{"status", :status, false, false, :string}, {"version", :version, false, false, :string}, {"type", :type, false, false, :string}, {"serverVersion", :server_version, false, false, :string}, {"openSubsonic", :open_subsonic, false, false, :boolean}, {"albumInfo", :album_info, false, false, :json_value}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetAlbumInfoParams do
  @enforce_keys [:id]
  defstruct [:id]
  @type t :: %__MODULE__{id: String.t()}
  def __schema__, do: [{"id", :id, true, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetAlbumListOutput do
  @enforce_keys []
  defstruct [:status, :version, :type, :server_version, :open_subsonic, :album_list2]
  @type t :: %__MODULE__{status: String.t() | nil, version: String.t() | nil, type: String.t() | nil, server_version: String.t() | nil, open_subsonic: boolean() | nil, album_list2: Rocksky.Codec.json_value() | nil}
  def __schema__, do: [{"status", :status, false, false, :string}, {"version", :version, false, false, :string}, {"type", :type, false, false, :string}, {"serverVersion", :server_version, false, false, :string}, {"openSubsonic", :open_subsonic, false, false, :boolean}, {"albumList2", :album_list2, false, false, :json_value}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetAlbumListParams do
  @enforce_keys [:type]
  defstruct [:type, :size, :offset, :from_year, :to_year, :genre]
  @type t :: %__MODULE__{type: String.t(), size: integer() | nil, offset: integer() | nil, from_year: integer() | nil, to_year: integer() | nil, genre: String.t() | nil}
  def __schema__, do: [{"type", :type, true, false, :string}, {"size", :size, false, false, :integer}, {"offset", :offset, false, false, :integer}, {"fromYear", :from_year, false, false, :integer}, {"toYear", :to_year, false, false, :integer}, {"genre", :genre, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetAlbumRecommendationsParams do
  @enforce_keys [:did]
  defstruct [:did, :limit]
  @type t :: %__MODULE__{did: String.t(), limit: integer() | nil}
  def __schema__, do: [{"did", :did, true, false, :string}, {"limit", :limit, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetAlbumShoutsOutput do
  @enforce_keys []
  defstruct [:shouts]
  @type t :: %__MODULE__{shouts: [Rocksky.Models.ShoutView.t()] | nil}
  def __schema__, do: [{"shouts", :shouts, false, false, {:list, {:record, Rocksky.Models.ShoutView}}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetAlbumShoutsParams do
  @enforce_keys [:uri]
  defstruct [:uri, :limit, :offset]
  @type t :: %__MODULE__{uri: String.t(), limit: integer() | nil, offset: integer() | nil}
  def __schema__, do: [{"uri", :uri, true, false, :string}, {"limit", :limit, false, false, :integer}, {"offset", :offset, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetAlbumsOutput do
  @enforce_keys []
  defstruct [:albums]
  @type t :: %__MODULE__{albums: [Rocksky.Models.AlbumViewBasic.t()] | nil}
  def __schema__, do: [{"albums", :albums, false, false, {:list, {:record, Rocksky.Models.AlbumViewBasic}}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetAlbumsParams do
  @enforce_keys []
  defstruct [:limit, :offset, :genre, :filter]
  @type t :: %__MODULE__{limit: integer() | nil, offset: integer() | nil, genre: String.t() | nil, filter: String.t() | nil}
  def __schema__, do: [{"limit", :limit, false, false, :integer}, {"offset", :offset, false, false, :integer}, {"genre", :genre, false, false, :string}, {"filter", :filter, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetAlbumTracksOutput do
  @enforce_keys []
  defstruct [:tracks]
  @type t :: %__MODULE__{tracks: [Rocksky.Models.SongViewBasic.t()] | nil}
  def __schema__, do: [{"tracks", :tracks, false, false, {:list, {:record, Rocksky.Models.SongViewBasic}}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetAlbumTracksParams do
  @enforce_keys [:uri]
  defstruct [:uri]
  @type t :: %__MODULE__{uri: String.t()}
  def __schema__, do: [{"uri", :uri, true, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetApikeysOutput do
  @enforce_keys []
  defstruct [:apikeys]
  @type t :: %__MODULE__{apikeys: [Rocksky.Models.ApiKeyView.t()] | nil}
  def __schema__, do: [{"apikeys", :apikeys, false, false, {:list, {:record, Rocksky.Models.ApiKeyView}}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetApikeysParams do
  @enforce_keys []
  defstruct [:offset, :limit]
  @type t :: %__MODULE__{offset: integer() | nil, limit: integer() | nil}
  def __schema__, do: [{"offset", :offset, false, false, :integer}, {"limit", :limit, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetArtistAlbumsOutput do
  @enforce_keys []
  defstruct [:albums]
  @type t :: %__MODULE__{albums: [Rocksky.Models.AlbumViewBasic.t()] | nil}
  def __schema__, do: [{"albums", :albums, false, false, {:list, {:record, Rocksky.Models.AlbumViewBasic}}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetArtistAlbumsParams do
  @enforce_keys [:uri]
  defstruct [:uri]
  @type t :: %__MODULE__{uri: String.t()}
  def __schema__, do: [{"uri", :uri, true, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetArtistInfoOutput do
  @enforce_keys []
  defstruct [:status, :version, :type, :server_version, :open_subsonic, :artist_info2]
  @type t :: %__MODULE__{status: String.t() | nil, version: String.t() | nil, type: String.t() | nil, server_version: String.t() | nil, open_subsonic: boolean() | nil, artist_info2: Rocksky.Codec.json_value() | nil}
  def __schema__, do: [{"status", :status, false, false, :string}, {"version", :version, false, false, :string}, {"type", :type, false, false, :string}, {"serverVersion", :server_version, false, false, :string}, {"openSubsonic", :open_subsonic, false, false, :boolean}, {"artistInfo2", :artist_info2, false, false, :json_value}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetArtistInfoParams do
  @enforce_keys [:id]
  defstruct [:id]
  @type t :: %__MODULE__{id: String.t()}
  def __schema__, do: [{"id", :id, true, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetArtistListenersOutput do
  @enforce_keys []
  defstruct [:listeners]
  @type t :: %__MODULE__{listeners: [Rocksky.Models.ArtistListenerViewBasic.t()] | nil}
  def __schema__, do: [{"listeners", :listeners, false, false, {:list, {:record, Rocksky.Models.ArtistListenerViewBasic}}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetArtistListenersParams do
  @enforce_keys [:uri]
  defstruct [:uri, :offset, :limit]
  @type t :: %__MODULE__{uri: String.t(), offset: integer() | nil, limit: integer() | nil}
  def __schema__, do: [{"uri", :uri, true, false, :string}, {"offset", :offset, false, false, :integer}, {"limit", :limit, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetArtistRecentListenersOutput do
  @enforce_keys []
  defstruct [:listeners]
  @type t :: %__MODULE__{listeners: [Rocksky.Models.ArtistRecentListenerView.t()] | nil}
  def __schema__, do: [{"listeners", :listeners, false, false, {:list, {:record, Rocksky.Models.ArtistRecentListenerView}}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetArtistRecentListenersParams do
  @enforce_keys [:uri]
  defstruct [:uri, :offset, :limit]
  @type t :: %__MODULE__{uri: String.t(), offset: integer() | nil, limit: integer() | nil}
  def __schema__, do: [{"uri", :uri, true, false, :string}, {"offset", :offset, false, false, :integer}, {"limit", :limit, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetArtistRecommendationsParams do
  @enforce_keys [:did]
  defstruct [:did, :limit]
  @type t :: %__MODULE__{did: String.t(), limit: integer() | nil}
  def __schema__, do: [{"did", :did, true, false, :string}, {"limit", :limit, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetArtistShoutsOutput do
  @enforce_keys []
  defstruct [:shouts]
  @type t :: %__MODULE__{shouts: [Rocksky.Models.ShoutView.t()] | nil}
  def __schema__, do: [{"shouts", :shouts, false, false, {:list, {:record, Rocksky.Models.ShoutView}}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetArtistShoutsParams do
  @enforce_keys [:uri]
  defstruct [:uri, :limit, :offset]
  @type t :: %__MODULE__{uri: String.t(), limit: integer() | nil, offset: integer() | nil}
  def __schema__, do: [{"uri", :uri, true, false, :string}, {"limit", :limit, false, false, :integer}, {"offset", :offset, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetArtistTracksOutput do
  @enforce_keys []
  defstruct [:tracks]
  @type t :: %__MODULE__{tracks: [Rocksky.Models.SongViewBasic.t()] | nil}
  def __schema__, do: [{"tracks", :tracks, false, false, {:list, {:record, Rocksky.Models.SongViewBasic}}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetArtistTracksParams do
  @enforce_keys []
  defstruct [:uri, :limit, :offset]
  @type t :: %__MODULE__{uri: String.t() | nil, limit: integer() | nil, offset: integer() | nil}
  def __schema__, do: [{"uri", :uri, false, false, :string}, {"limit", :limit, false, false, :integer}, {"offset", :offset, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetAudioSettingsParams do
  @enforce_keys []
  defstruct [:did]
  @type t :: %__MODULE__{did: String.t() | nil}
  def __schema__, do: [{"did", :did, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetCoverArtUrlOutput do
  @enforce_keys [:url]
  defstruct [:url]
  @type t :: %__MODULE__{url: String.t()}
  def __schema__, do: [{"url", :url, true, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetCoverArtUrlParams do
  @enforce_keys [:id]
  defstruct [:id, :size]
  @type t :: %__MODULE__{id: String.t(), size: integer() | nil}
  def __schema__, do: [{"id", :id, true, false, :string}, {"size", :size, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetDecadesOutput do
  @enforce_keys []
  defstruct [:decades]
  @type t :: %__MODULE__{decades: [Rocksky.Models.ChartsDecadeViewBasic.t()] | nil}
  def __schema__, do: [{"decades", :decades, false, false, {:list, {:record, Rocksky.Models.ChartsDecadeViewBasic}}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetDecadesParams do
  @enforce_keys []
  defstruct [:did, :start_date, :end_date]
  @type t :: %__MODULE__{did: String.t() | nil, start_date: String.t() | nil, end_date: String.t() | nil}
  def __schema__, do: [{"did", :did, false, false, :string}, {"startDate", :start_date, false, false, :string}, {"endDate", :end_date, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetDownloadUrlOutput do
  @enforce_keys [:url]
  defstruct [:url]
  @type t :: %__MODULE__{url: String.t()}
  def __schema__, do: [{"url", :url, true, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetDownloadUrlParams do
  @enforce_keys [:id]
  defstruct [:id]
  @type t :: %__MODULE__{id: String.t()}
  def __schema__, do: [{"id", :id, true, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetFeedGeneratorOutput do
  @enforce_keys []
  defstruct [:view]
  @type t :: %__MODULE__{view: Rocksky.Models.FeedGeneratorView.t() | nil}
  def __schema__, do: [{"view", :view, false, false, {:record, Rocksky.Models.FeedGeneratorView}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetFeedGeneratorParams do
  @enforce_keys [:feed]
  defstruct [:feed]
  @type t :: %__MODULE__{feed: String.t()}
  def __schema__, do: [{"feed", :feed, true, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetFeedGeneratorsParams do
  @enforce_keys []
  defstruct [:size]
  @type t :: %__MODULE__{size: integer() | nil}
  def __schema__, do: [{"size", :size, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetFeedParams do
  @enforce_keys [:feed]
  defstruct [:feed, :limit, :cursor]
  @type t :: %__MODULE__{feed: String.t(), limit: integer() | nil, cursor: String.t() | nil}
  def __schema__, do: [{"feed", :feed, true, false, :string}, {"limit", :limit, false, false, :integer}, {"cursor", :cursor, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetFeedSkeletonOutput do
  @enforce_keys []
  defstruct [:scrobbles, :cursor]
  @type t :: %__MODULE__{scrobbles: [Rocksky.Models.ScrobbleViewBasic.t()] | nil, cursor: String.t() | nil}
  def __schema__, do: [{"scrobbles", :scrobbles, false, false, {:list, {:record, Rocksky.Models.ScrobbleViewBasic}}}, {"cursor", :cursor, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetFeedSkeletonParams do
  @enforce_keys [:feed]
  defstruct [:feed, :limit, :offset, :cursor]
  @type t :: %__MODULE__{feed: String.t(), limit: integer() | nil, offset: integer() | nil, cursor: String.t() | nil}
  def __schema__, do: [{"feed", :feed, true, false, :string}, {"limit", :limit, false, false, :integer}, {"offset", :offset, false, false, :integer}, {"cursor", :cursor, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetFileParams do
  @enforce_keys [:file_id]
  defstruct [:file_id]
  @type t :: %__MODULE__{file_id: String.t()}
  def __schema__, do: [{"fileId", :file_id, true, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetFollowersOutput do
  @enforce_keys [:subject, :followers]
  defstruct [:subject, :followers, :cursor, :count]
  @type t :: %__MODULE__{subject: Rocksky.Models.ActorProfileViewBasic.t(), followers: [Rocksky.Models.ActorProfileViewBasic.t()], cursor: String.t() | nil, count: integer() | nil}
  def __schema__, do: [{"subject", :subject, true, false, {:record, Rocksky.Models.ActorProfileViewBasic}}, {"followers", :followers, true, false, {:list, {:record, Rocksky.Models.ActorProfileViewBasic}}}, {"cursor", :cursor, false, false, :string}, {"count", :count, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetFollowersParams do
  @enforce_keys [:actor]
  defstruct [:actor, :limit, :dids, :cursor]
  @type t :: %__MODULE__{actor: String.t(), limit: integer() | nil, dids: [String.t()] | nil, cursor: String.t() | nil}
  def __schema__, do: [{"actor", :actor, true, false, :string}, {"limit", :limit, false, false, :integer}, {"dids", :dids, false, false, {:list, :string}}, {"cursor", :cursor, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetFollowsOutput do
  @enforce_keys [:subject, :follows]
  defstruct [:subject, :follows, :cursor, :count]
  @type t :: %__MODULE__{subject: Rocksky.Models.ActorProfileViewBasic.t(), follows: [Rocksky.Models.ActorProfileViewBasic.t()], cursor: String.t() | nil, count: integer() | nil}
  def __schema__, do: [{"subject", :subject, true, false, {:record, Rocksky.Models.ActorProfileViewBasic}}, {"follows", :follows, true, false, {:list, {:record, Rocksky.Models.ActorProfileViewBasic}}}, {"cursor", :cursor, false, false, :string}, {"count", :count, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetFollowsParams do
  @enforce_keys [:actor]
  defstruct [:actor, :limit, :dids, :cursor]
  @type t :: %__MODULE__{actor: String.t(), limit: integer() | nil, dids: [String.t()] | nil, cursor: String.t() | nil}
  def __schema__, do: [{"actor", :actor, true, false, :string}, {"limit", :limit, false, false, :integer}, {"dids", :dids, false, false, {:list, :string}}, {"cursor", :cursor, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetGenresOutput do
  @enforce_keys []
  defstruct [:status, :version, :type, :server_version, :open_subsonic, :genres]
  @type t :: %__MODULE__{status: String.t() | nil, version: String.t() | nil, type: String.t() | nil, server_version: String.t() | nil, open_subsonic: boolean() | nil, genres: Rocksky.Codec.json_value() | nil}
  def __schema__, do: [{"status", :status, false, false, :string}, {"version", :version, false, false, :string}, {"type", :type, false, false, :string}, {"serverVersion", :server_version, false, false, :string}, {"openSubsonic", :open_subsonic, false, false, :boolean}, {"genres", :genres, false, false, :json_value}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetGenresParams do
  @enforce_keys []
  defstruct []
  @type t :: %__MODULE__{}
  def __schema__, do: []
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetGlobalStatsParams do
  @enforce_keys []
  defstruct []
  @type t :: %__MODULE__{}
  def __schema__, do: []
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetIndexesOutput do
  @enforce_keys []
  defstruct [:status, :version, :type, :server_version, :open_subsonic, :indexes]
  @type t :: %__MODULE__{status: String.t() | nil, version: String.t() | nil, type: String.t() | nil, server_version: String.t() | nil, open_subsonic: boolean() | nil, indexes: Rocksky.Codec.json_value() | nil}
  def __schema__, do: [{"status", :status, false, false, :string}, {"version", :version, false, false, :string}, {"type", :type, false, false, :string}, {"serverVersion", :server_version, false, false, :string}, {"openSubsonic", :open_subsonic, false, false, :boolean}, {"indexes", :indexes, false, false, :json_value}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetIndexesParams do
  @enforce_keys []
  defstruct []
  @type t :: %__MODULE__{}
  def __schema__, do: []
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetInternetRadioStationsOutput do
  @enforce_keys []
  defstruct [:status, :version, :type, :server_version, :open_subsonic, :internet_radio_stations]
  @type t :: %__MODULE__{status: String.t() | nil, version: String.t() | nil, type: String.t() | nil, server_version: String.t() | nil, open_subsonic: boolean() | nil, internet_radio_stations: Rocksky.Codec.json_value() | nil}
  def __schema__, do: [{"status", :status, false, false, :string}, {"version", :version, false, false, :string}, {"type", :type, false, false, :string}, {"serverVersion", :server_version, false, false, :string}, {"openSubsonic", :open_subsonic, false, false, :boolean}, {"internetRadioStations", :internet_radio_stations, false, false, :json_value}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetInternetRadioStationsParams do
  @enforce_keys []
  defstruct []
  @type t :: %__MODULE__{}
  def __schema__, do: []
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetKnownFollowersOutput do
  @enforce_keys [:subject, :followers]
  defstruct [:subject, :followers, :cursor]
  @type t :: %__MODULE__{subject: Rocksky.Models.ActorProfileViewBasic.t(), followers: [Rocksky.Models.ActorProfileViewBasic.t()], cursor: String.t() | nil}
  def __schema__, do: [{"subject", :subject, true, false, {:record, Rocksky.Models.ActorProfileViewBasic}}, {"followers", :followers, true, false, {:list, {:record, Rocksky.Models.ActorProfileViewBasic}}}, {"cursor", :cursor, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetKnownFollowersParams do
  @enforce_keys [:actor]
  defstruct [:actor, :limit, :cursor]
  @type t :: %__MODULE__{actor: String.t(), limit: integer() | nil, cursor: String.t() | nil}
  def __schema__, do: [{"actor", :actor, true, false, :string}, {"limit", :limit, false, false, :integer}, {"cursor", :cursor, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetLicenseOutput do
  @enforce_keys []
  defstruct [:status, :version, :type, :server_version, :open_subsonic, :license]
  @type t :: %__MODULE__{status: String.t() | nil, version: String.t() | nil, type: String.t() | nil, server_version: String.t() | nil, open_subsonic: boolean() | nil, license: Rocksky.Codec.json_value() | nil}
  def __schema__, do: [{"status", :status, false, false, :string}, {"version", :version, false, false, :string}, {"type", :type, false, false, :string}, {"serverVersion", :server_version, false, false, :string}, {"openSubsonic", :open_subsonic, false, false, :boolean}, {"license", :license, false, false, :json_value}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetLicenseParams do
  @enforce_keys []
  defstruct []
  @type t :: %__MODULE__{}
  def __schema__, do: []
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetLyricsOutput do
  @enforce_keys []
  defstruct [:status, :version, :type, :server_version, :open_subsonic, :lyrics]
  @type t :: %__MODULE__{status: String.t() | nil, version: String.t() | nil, type: String.t() | nil, server_version: String.t() | nil, open_subsonic: boolean() | nil, lyrics: Rocksky.Codec.json_value() | nil}
  def __schema__, do: [{"status", :status, false, false, :string}, {"version", :version, false, false, :string}, {"type", :type, false, false, :string}, {"serverVersion", :server_version, false, false, :string}, {"openSubsonic", :open_subsonic, false, false, :boolean}, {"lyrics", :lyrics, false, false, :json_value}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetLyricsParams do
  @enforce_keys []
  defstruct [:artist, :title]
  @type t :: %__MODULE__{artist: String.t() | nil, title: String.t() | nil}
  def __schema__, do: [{"artist", :artist, false, false, :string}, {"title", :title, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetMetadataOutput do
  @enforce_keys []
  defstruct [:metadata]
  @type t :: %__MODULE__{metadata: Rocksky.Codec.json_value() | nil}
  def __schema__, do: [{"metadata", :metadata, false, false, :json_value}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetMetadataParams do
  @enforce_keys [:path]
  defstruct [:path]
  @type t :: %__MODULE__{path: String.t()}
  def __schema__, do: [{"path", :path, true, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetMirrorSourcesOutput do
  @enforce_keys [:sources]
  defstruct [:sources]
  @type t :: %__MODULE__{sources: [Rocksky.Models.MirrorSourceView.t()]}
  def __schema__, do: [{"sources", :sources, true, false, {:list, {:record, Rocksky.Models.MirrorSourceView}}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetMirrorSourcesParams do
  @enforce_keys []
  defstruct []
  @type t :: %__MODULE__{}
  def __schema__, do: []
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetMusicDirectoryOutput do
  @enforce_keys []
  defstruct [:status, :version, :type, :server_version, :open_subsonic, :directory]
  @type t :: %__MODULE__{status: String.t() | nil, version: String.t() | nil, type: String.t() | nil, server_version: String.t() | nil, open_subsonic: boolean() | nil, directory: Rocksky.Codec.json_value() | nil}
  def __schema__, do: [{"status", :status, false, false, :string}, {"version", :version, false, false, :string}, {"type", :type, false, false, :string}, {"serverVersion", :server_version, false, false, :string}, {"openSubsonic", :open_subsonic, false, false, :boolean}, {"directory", :directory, false, false, :json_value}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetMusicDirectoryParams do
  @enforce_keys [:id]
  defstruct [:id]
  @type t :: %__MODULE__{id: String.t()}
  def __schema__, do: [{"id", :id, true, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetMusicFoldersOutput do
  @enforce_keys []
  defstruct [:status, :version, :type, :server_version, :open_subsonic, :music_folders]
  @type t :: %__MODULE__{status: String.t() | nil, version: String.t() | nil, type: String.t() | nil, server_version: String.t() | nil, open_subsonic: boolean() | nil, music_folders: Rocksky.Codec.json_value() | nil}
  def __schema__, do: [{"status", :status, false, false, :string}, {"version", :version, false, false, :string}, {"type", :type, false, false, :string}, {"serverVersion", :server_version, false, false, :string}, {"openSubsonic", :open_subsonic, false, false, :boolean}, {"musicFolders", :music_folders, false, false, :json_value}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetMusicFoldersParams do
  @enforce_keys []
  defstruct []
  @type t :: %__MODULE__{}
  def __schema__, do: []
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetNowPlayingOutput do
  @enforce_keys []
  defstruct [:status, :version, :type, :server_version, :open_subsonic, :now_playing]
  @type t :: %__MODULE__{status: String.t() | nil, version: String.t() | nil, type: String.t() | nil, server_version: String.t() | nil, open_subsonic: boolean() | nil, now_playing: Rocksky.Codec.json_value() | nil}
  def __schema__, do: [{"status", :status, false, false, :string}, {"version", :version, false, false, :string}, {"type", :type, false, false, :string}, {"serverVersion", :server_version, false, false, :string}, {"openSubsonic", :open_subsonic, false, false, :boolean}, {"nowPlaying", :now_playing, false, false, :json_value}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetNowPlayingParams do
  @enforce_keys []
  defstruct []
  @type t :: %__MODULE__{}
  def __schema__, do: []
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetPlaybackQueueParams do
  @enforce_keys []
  defstruct [:player_id]
  @type t :: %__MODULE__{player_id: String.t() | nil}
  def __schema__, do: [{"playerId", :player_id, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetPlayQueueOutput do
  @enforce_keys []
  defstruct [:status, :version, :type, :server_version, :open_subsonic, :play_queue]
  @type t :: %__MODULE__{status: String.t() | nil, version: String.t() | nil, type: String.t() | nil, server_version: String.t() | nil, open_subsonic: boolean() | nil, play_queue: Rocksky.Codec.json_value() | nil}
  def __schema__, do: [{"status", :status, false, false, :string}, {"version", :version, false, false, :string}, {"type", :type, false, false, :string}, {"serverVersion", :server_version, false, false, :string}, {"openSubsonic", :open_subsonic, false, false, :boolean}, {"playQueue", :play_queue, false, false, :json_value}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetPlayQueueParams do
  @enforce_keys []
  defstruct []
  @type t :: %__MODULE__{}
  def __schema__, do: []
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetProfileParams do
  @enforce_keys []
  defstruct [:did]
  @type t :: %__MODULE__{did: String.t() | nil}
  def __schema__, do: [{"did", :did, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetProfileShoutsOutput do
  @enforce_keys []
  defstruct [:shouts]
  @type t :: %__MODULE__{shouts: [Rocksky.Models.ShoutView.t()] | nil}
  def __schema__, do: [{"shouts", :shouts, false, false, {:list, {:record, Rocksky.Models.ShoutView}}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetProfileShoutsParams do
  @enforce_keys [:did]
  defstruct [:did, :offset, :limit]
  @type t :: %__MODULE__{did: String.t(), offset: integer() | nil, limit: integer() | nil}
  def __schema__, do: [{"did", :did, true, false, :string}, {"offset", :offset, false, false, :integer}, {"limit", :limit, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetRandomSongsOutput do
  @enforce_keys []
  defstruct [:status, :version, :type, :server_version, :open_subsonic, :random_songs]
  @type t :: %__MODULE__{status: String.t() | nil, version: String.t() | nil, type: String.t() | nil, server_version: String.t() | nil, open_subsonic: boolean() | nil, random_songs: Rocksky.Codec.json_value() | nil}
  def __schema__, do: [{"status", :status, false, false, :string}, {"version", :version, false, false, :string}, {"type", :type, false, false, :string}, {"serverVersion", :server_version, false, false, :string}, {"openSubsonic", :open_subsonic, false, false, :boolean}, {"randomSongs", :random_songs, false, false, :json_value}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetRandomSongsParams do
  @enforce_keys []
  defstruct [:size, :genre, :from_year, :to_year]
  @type t :: %__MODULE__{size: integer() | nil, genre: String.t() | nil, from_year: integer() | nil, to_year: integer() | nil}
  def __schema__, do: [{"size", :size, false, false, :integer}, {"genre", :genre, false, false, :string}, {"fromYear", :from_year, false, false, :integer}, {"toYear", :to_year, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetRecommendationsParams do
  @enforce_keys [:did]
  defstruct [:did, :limit]
  @type t :: %__MODULE__{did: String.t(), limit: integer() | nil}
  def __schema__, do: [{"did", :did, true, false, :string}, {"limit", :limit, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetScanStatusOutput do
  @enforce_keys []
  defstruct [:status, :version, :type, :server_version, :open_subsonic, :scan_status]
  @type t :: %__MODULE__{status: String.t() | nil, version: String.t() | nil, type: String.t() | nil, server_version: String.t() | nil, open_subsonic: boolean() | nil, scan_status: Rocksky.Codec.json_value() | nil}
  def __schema__, do: [{"status", :status, false, false, :string}, {"version", :version, false, false, :string}, {"type", :type, false, false, :string}, {"serverVersion", :server_version, false, false, :string}, {"openSubsonic", :open_subsonic, false, false, :boolean}, {"scanStatus", :scan_status, false, false, :json_value}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetScanStatusParams do
  @enforce_keys []
  defstruct []
  @type t :: %__MODULE__{}
  def __schema__, do: []
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetScrobbleParams do
  @enforce_keys [:uri]
  defstruct [:uri]
  @type t :: %__MODULE__{uri: String.t()}
  def __schema__, do: [{"uri", :uri, true, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetScrobblesChartParams do
  @enforce_keys []
  defstruct [:did, :artisturi, :albumuri, :songuri, :genre, :from, :to]
  @type t :: %__MODULE__{did: String.t() | nil, artisturi: String.t() | nil, albumuri: String.t() | nil, songuri: String.t() | nil, genre: String.t() | nil, from: String.t() | nil, to: String.t() | nil}
  def __schema__, do: [{"did", :did, false, false, :string}, {"artisturi", :artisturi, false, false, :string}, {"albumuri", :albumuri, false, false, :string}, {"songuri", :songuri, false, false, :string}, {"genre", :genre, false, false, :string}, {"from", :from, false, false, :string}, {"to", :to, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetScrobblesOutput do
  @enforce_keys []
  defstruct [:scrobbles]
  @type t :: %__MODULE__{scrobbles: [Rocksky.Models.ScrobbleViewBasic.t()] | nil}
  def __schema__, do: [{"scrobbles", :scrobbles, false, false, {:list, {:record, Rocksky.Models.ScrobbleViewBasic}}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetScrobblesParams do
  @enforce_keys []
  defstruct [:did, :following, :limit, :offset, :filter]
  @type t :: %__MODULE__{did: String.t() | nil, following: boolean() | nil, limit: integer() | nil, offset: integer() | nil, filter: String.t() | nil}
  def __schema__, do: [{"did", :did, false, false, :string}, {"following", :following, false, false, :boolean}, {"limit", :limit, false, false, :integer}, {"offset", :offset, false, false, :integer}, {"filter", :filter, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetShoutRepliesOutput do
  @enforce_keys []
  defstruct [:shouts]
  @type t :: %__MODULE__{shouts: [Rocksky.Models.ShoutView.t()] | nil}
  def __schema__, do: [{"shouts", :shouts, false, false, {:list, {:record, Rocksky.Models.ShoutView}}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetShoutRepliesParams do
  @enforce_keys [:uri]
  defstruct [:uri, :limit, :offset]
  @type t :: %__MODULE__{uri: String.t(), limit: integer() | nil, offset: integer() | nil}
  def __schema__, do: [{"uri", :uri, true, false, :string}, {"limit", :limit, false, false, :integer}, {"offset", :offset, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetSimilarSongsOutput do
  @enforce_keys []
  defstruct [:status, :version, :type, :server_version, :open_subsonic, :similar_songs2]
  @type t :: %__MODULE__{status: String.t() | nil, version: String.t() | nil, type: String.t() | nil, server_version: String.t() | nil, open_subsonic: boolean() | nil, similar_songs2: Rocksky.Codec.json_value() | nil}
  def __schema__, do: [{"status", :status, false, false, :string}, {"version", :version, false, false, :string}, {"type", :type, false, false, :string}, {"serverVersion", :server_version, false, false, :string}, {"openSubsonic", :open_subsonic, false, false, :boolean}, {"similarSongs2", :similar_songs2, false, false, :json_value}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetSimilarSongsParams do
  @enforce_keys [:id]
  defstruct [:id, :count]
  @type t :: %__MODULE__{id: String.t(), count: integer() | nil}
  def __schema__, do: [{"id", :id, true, false, :string}, {"count", :count, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetSongRecentListenersOutput do
  @enforce_keys []
  defstruct [:listeners]
  @type t :: %__MODULE__{listeners: [Rocksky.Models.SongRecentListenerView.t()] | nil}
  def __schema__, do: [{"listeners", :listeners, false, false, {:list, {:record, Rocksky.Models.SongRecentListenerView}}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetSongRecentListenersParams do
  @enforce_keys [:uri]
  defstruct [:uri, :offset, :limit]
  @type t :: %__MODULE__{uri: String.t(), offset: integer() | nil, limit: integer() | nil}
  def __schema__, do: [{"uri", :uri, true, false, :string}, {"offset", :offset, false, false, :integer}, {"limit", :limit, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetSongsByGenreOutput do
  @enforce_keys []
  defstruct [:status, :version, :type, :server_version, :open_subsonic, :songs_by_genre]
  @type t :: %__MODULE__{status: String.t() | nil, version: String.t() | nil, type: String.t() | nil, server_version: String.t() | nil, open_subsonic: boolean() | nil, songs_by_genre: Rocksky.Codec.json_value() | nil}
  def __schema__, do: [{"status", :status, false, false, :string}, {"version", :version, false, false, :string}, {"type", :type, false, false, :string}, {"serverVersion", :server_version, false, false, :string}, {"openSubsonic", :open_subsonic, false, false, :boolean}, {"songsByGenre", :songs_by_genre, false, false, :json_value}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetSongsByGenreParams do
  @enforce_keys [:genre]
  defstruct [:genre, :count, :offset]
  @type t :: %__MODULE__{genre: String.t(), count: integer() | nil, offset: integer() | nil}
  def __schema__, do: [{"genre", :genre, true, false, :string}, {"count", :count, false, false, :integer}, {"offset", :offset, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetSongsOutput do
  @enforce_keys []
  defstruct [:tracks]
  @type t :: %__MODULE__{tracks: [Rocksky.Models.SongViewBasic.t()] | nil}
  def __schema__, do: [{"tracks", :tracks, false, false, {:list, {:record, Rocksky.Models.SongViewBasic}}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetSongsParams do
  @enforce_keys []
  defstruct [:limit, :offset, :genre, :mbid, :isrc, :spotify_id, :filter]
  @type t :: %__MODULE__{limit: integer() | nil, offset: integer() | nil, genre: String.t() | nil, mbid: String.t() | nil, isrc: String.t() | nil, spotify_id: String.t() | nil, filter: String.t() | nil}
  def __schema__, do: [{"limit", :limit, false, false, :integer}, {"offset", :offset, false, false, :integer}, {"genre", :genre, false, false, :string}, {"mbid", :mbid, false, false, :string}, {"isrc", :isrc, false, false, :string}, {"spotifyId", :spotify_id, false, false, :string}, {"filter", :filter, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetStarredOutput do
  @enforce_keys []
  defstruct [:status, :version, :type, :server_version, :open_subsonic, :starred2]
  @type t :: %__MODULE__{status: String.t() | nil, version: String.t() | nil, type: String.t() | nil, server_version: String.t() | nil, open_subsonic: boolean() | nil, starred2: Rocksky.Codec.json_value() | nil}
  def __schema__, do: [{"status", :status, false, false, :string}, {"version", :version, false, false, :string}, {"type", :type, false, false, :string}, {"serverVersion", :server_version, false, false, :string}, {"openSubsonic", :open_subsonic, false, false, :boolean}, {"starred2", :starred2, false, false, :json_value}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetStarredParams do
  @enforce_keys []
  defstruct []
  @type t :: %__MODULE__{}
  def __schema__, do: []
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetStatsParams do
  @enforce_keys [:did]
  defstruct [:did]
  @type t :: %__MODULE__{did: String.t()}
  def __schema__, do: [{"did", :did, true, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetStoriesParams do
  @enforce_keys []
  defstruct [:size, :feed, :following]
  @type t :: %__MODULE__{size: integer() | nil, feed: String.t() | nil, following: boolean() | nil}
  def __schema__, do: [{"size", :size, false, false, :integer}, {"feed", :feed, false, false, :string}, {"following", :following, false, false, :boolean}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetStreamUrlOutput do
  @enforce_keys [:url]
  defstruct [:url]
  @type t :: %__MODULE__{url: String.t()}
  def __schema__, do: [{"url", :url, true, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetStreamUrlParams do
  @enforce_keys [:id]
  defstruct [:id, :max_bit_rate, :format]
  @type t :: %__MODULE__{id: String.t(), max_bit_rate: integer() | nil, format: String.t() | nil}
  def __schema__, do: [{"id", :id, true, false, :string}, {"maxBitRate", :max_bit_rate, false, false, :integer}, {"format", :format, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetTemporaryLinkParams do
  @enforce_keys [:path]
  defstruct [:path]
  @type t :: %__MODULE__{path: String.t()}
  def __schema__, do: [{"path", :path, true, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetTopArtistsOutput do
  @enforce_keys []
  defstruct [:artists]
  @type t :: %__MODULE__{artists: [Rocksky.Models.ArtistViewBasic.t()] | nil}
  def __schema__, do: [{"artists", :artists, false, false, {:list, {:record, Rocksky.Models.ArtistViewBasic}}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetTopArtistsParams do
  @enforce_keys []
  defstruct [:did, :limit, :offset, :start_date, :end_date]
  @type t :: %__MODULE__{did: String.t() | nil, limit: integer() | nil, offset: integer() | nil, start_date: String.t() | nil, end_date: String.t() | nil}
  def __schema__, do: [{"did", :did, false, false, :string}, {"limit", :limit, false, false, :integer}, {"offset", :offset, false, false, :integer}, {"startDate", :start_date, false, false, :string}, {"endDate", :end_date, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetTopScrobblersOutput do
  @enforce_keys []
  defstruct [:scrobblers]
  @type t :: %__MODULE__{scrobblers: [Rocksky.Models.ChartsScrobblerViewBasic.t()] | nil}
  def __schema__, do: [{"scrobblers", :scrobblers, false, false, {:list, {:record, Rocksky.Models.ChartsScrobblerViewBasic}}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetTopScrobblersParams do
  @enforce_keys []
  defstruct [:limit, :offset, :start_date, :end_date]
  @type t :: %__MODULE__{limit: integer() | nil, offset: integer() | nil, start_date: String.t() | nil, end_date: String.t() | nil}
  def __schema__, do: [{"limit", :limit, false, false, :integer}, {"offset", :offset, false, false, :integer}, {"startDate", :start_date, false, false, :string}, {"endDate", :end_date, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetTopSongsOutput do
  @enforce_keys []
  defstruct [:status, :version, :type, :server_version, :open_subsonic, :top_songs]
  @type t :: %__MODULE__{status: String.t() | nil, version: String.t() | nil, type: String.t() | nil, server_version: String.t() | nil, open_subsonic: boolean() | nil, top_songs: Rocksky.Codec.json_value() | nil}
  def __schema__, do: [{"status", :status, false, false, :string}, {"version", :version, false, false, :string}, {"type", :type, false, false, :string}, {"serverVersion", :server_version, false, false, :string}, {"openSubsonic", :open_subsonic, false, false, :boolean}, {"topSongs", :top_songs, false, false, :json_value}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetTopSongsParams do
  @enforce_keys [:artist]
  defstruct [:artist, :count]
  @type t :: %__MODULE__{artist: String.t(), count: integer() | nil}
  def __schema__, do: [{"artist", :artist, true, false, :string}, {"count", :count, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetTopTracksOutput do
  @enforce_keys []
  defstruct [:tracks]
  @type t :: %__MODULE__{tracks: [Rocksky.Models.SongViewBasic.t()] | nil}
  def __schema__, do: [{"tracks", :tracks, false, false, {:list, {:record, Rocksky.Models.SongViewBasic}}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetTopTracksParams do
  @enforce_keys []
  defstruct [:did, :limit, :offset, :start_date, :end_date]
  @type t :: %__MODULE__{did: String.t() | nil, limit: integer() | nil, offset: integer() | nil, start_date: String.t() | nil, end_date: String.t() | nil}
  def __schema__, do: [{"did", :did, false, false, :string}, {"limit", :limit, false, false, :integer}, {"offset", :offset, false, false, :integer}, {"startDate", :start_date, false, false, :string}, {"endDate", :end_date, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetTrackShoutsOutput do
  @enforce_keys []
  defstruct [:shouts]
  @type t :: %__MODULE__{shouts: [Rocksky.Models.ShoutView.t()] | nil}
  def __schema__, do: [{"shouts", :shouts, false, false, {:list, {:record, Rocksky.Models.ShoutView}}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetTrackShoutsParams do
  @enforce_keys [:uri]
  defstruct [:uri]
  @type t :: %__MODULE__{uri: String.t()}
  def __schema__, do: [{"uri", :uri, true, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetUnreadCountOutput do
  @enforce_keys [:count]
  defstruct [:count]
  @type t :: %__MODULE__{count: integer()}
  def __schema__, do: [{"count", :count, true, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetUserOutput do
  @enforce_keys []
  defstruct [:status, :version, :type, :server_version, :open_subsonic, :user]
  @type t :: %__MODULE__{status: String.t() | nil, version: String.t() | nil, type: String.t() | nil, server_version: String.t() | nil, open_subsonic: boolean() | nil, user: Rocksky.Codec.json_value() | nil}
  def __schema__, do: [{"status", :status, false, false, :string}, {"version", :version, false, false, :string}, {"type", :type, false, false, :string}, {"serverVersion", :server_version, false, false, :string}, {"openSubsonic", :open_subsonic, false, false, :boolean}, {"user", :user, false, false, :json_value}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetUserParams do
  @enforce_keys []
  defstruct []
  @type t :: %__MODULE__{}
  def __schema__, do: []
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GetWrappedParams do
  @enforce_keys [:did]
  defstruct [:did, :year, :period]
  @type t :: %__MODULE__{did: String.t(), year: integer() | nil, period: String.t() | nil}
  def __schema__, do: [{"did", :did, true, false, :string}, {"year", :year, false, false, :integer}, {"period", :period, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GoogledriveDownloadFileParams do
  @enforce_keys [:file_id]
  defstruct [:file_id]
  @type t :: %__MODULE__{file_id: String.t()}
  def __schema__, do: [{"fileId", :file_id, true, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GoogledriveFileListView do
  @enforce_keys []
  defstruct [:files, :directory, :parent_directory, :directories]
  @type t :: %__MODULE__{files: [Rocksky.Models.GoogledriveFileView.t()] | nil, directory: Rocksky.Models.GoogledriveResponseDirectoryView.t() | nil, parent_directory: Rocksky.Models.GoogledriveResponseParentDirectoryView.t() | nil, directories: [Rocksky.Models.GoogledriveResponseDirectoriesItemView.t()] | nil}
  def __schema__, do: [{"files", :files, false, false, {:list, {:record, Rocksky.Models.GoogledriveFileView}}}, {"directory", :directory, false, false, {:record, Rocksky.Models.GoogledriveResponseDirectoryView}}, {"parentDirectory", :parent_directory, false, false, {:record, Rocksky.Models.GoogledriveResponseParentDirectoryView}}, {"directories", :directories, false, false, {:list, {:record, Rocksky.Models.GoogledriveResponseDirectoriesItemView}}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GoogledriveFileView do
  @enforce_keys []
  defstruct [:id, :name, :file_id, :directory_id, :track_id, :created_at, :updated_at]
  @type t :: %__MODULE__{id: String.t() | nil, name: String.t() | nil, file_id: String.t() | nil, directory_id: String.t() | nil, track_id: String.t() | nil, created_at: String.t() | nil, updated_at: String.t() | nil}
  def __schema__, do: [{"id", :id, false, false, :string}, {"name", :name, false, false, :string}, {"fileId", :file_id, false, false, :string}, {"directoryId", :directory_id, false, false, :string}, {"trackId", :track_id, false, false, :string}, {"createdAt", :created_at, false, false, :string}, {"updatedAt", :updated_at, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GoogledriveGetFilesParams do
  @enforce_keys []
  defstruct [:at]
  @type t :: %__MODULE__{at: String.t() | nil}
  def __schema__, do: [{"at", :at, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GoogledriveResponseDirectoriesItemView do
  @enforce_keys []
  defstruct [:id, :name, :file_id, :path, :parent_id, :created_at, :updated_at]
  @type t :: %__MODULE__{id: String.t() | nil, name: String.t() | nil, file_id: String.t() | nil, path: String.t() | nil, parent_id: String.t() | nil, created_at: String.t() | nil, updated_at: String.t() | nil}
  def __schema__, do: [{"id", :id, false, false, :string}, {"name", :name, false, false, :string}, {"fileId", :file_id, false, false, :string}, {"path", :path, false, false, :string}, {"parentId", :parent_id, false, false, :string}, {"createdAt", :created_at, false, false, :string}, {"updatedAt", :updated_at, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GoogledriveResponseDirectoryView do
  @enforce_keys []
  defstruct []
  @type t :: %__MODULE__{}
  def __schema__, do: []
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GoogledriveResponseParentDirectoryView do
  @enforce_keys []
  defstruct []
  @type t :: %__MODULE__{}
  def __schema__, do: []
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GraphNotFoundActor do
  @enforce_keys [:actor, :not_found]
  defstruct [:actor, :not_found]
  @type t :: %__MODULE__{actor: String.t(), not_found: boolean()}
  def __schema__, do: [{"actor", :actor, true, false, :string}, {"notFound", :not_found, true, false, :boolean}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.GraphRelationship do
  @enforce_keys [:did]
  defstruct [:did, :following, :followed_by]
  @type t :: %__MODULE__{did: String.t(), following: String.t() | nil, followed_by: String.t() | nil}
  def __schema__, do: [{"did", :did, true, false, :string}, {"following", :following, false, false, :string}, {"followedBy", :followed_by, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.InsertDirectoryParams do
  @enforce_keys [:uri, :directory]
  defstruct [:uri, :directory, :position]
  @type t :: %__MODULE__{uri: String.t(), directory: String.t(), position: integer() | nil}
  def __schema__, do: [{"uri", :uri, true, false, :string}, {"directory", :directory, true, false, :string}, {"position", :position, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.InsertFilesParams do
  @enforce_keys [:uri, :files]
  defstruct [:uri, :files, :position]
  @type t :: %__MODULE__{uri: String.t(), files: [String.t()], position: integer() | nil}
  def __schema__, do: [{"uri", :uri, true, false, :string}, {"files", :files, true, false, {:list, :string}}, {"position", :position, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.LibraryCreatePlaylistInput do
  @enforce_keys [:name]
  defstruct [:name]
  @type t :: %__MODULE__{name: String.t()}
  def __schema__, do: [{"name", :name, true, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.LibraryCreatePlaylistOutput do
  @enforce_keys []
  defstruct [:status, :version, :type, :server_version, :open_subsonic, :playlist, :atproto_error]
  @type t :: %__MODULE__{status: String.t() | nil, version: String.t() | nil, type: String.t() | nil, server_version: String.t() | nil, open_subsonic: boolean() | nil, playlist: Rocksky.Codec.json_value() | nil, atproto_error: String.t() | nil}
  def __schema__, do: [{"status", :status, false, false, :string}, {"version", :version, false, false, :string}, {"type", :type, false, false, :string}, {"serverVersion", :server_version, false, false, :string}, {"openSubsonic", :open_subsonic, false, false, :boolean}, {"playlist", :playlist, false, false, :json_value}, {"atprotoError", :atproto_error, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.LibraryGetAlbumOutput do
  @enforce_keys []
  defstruct [:status, :version, :type, :server_version, :open_subsonic, :album]
  @type t :: %__MODULE__{status: String.t() | nil, version: String.t() | nil, type: String.t() | nil, server_version: String.t() | nil, open_subsonic: boolean() | nil, album: Rocksky.Codec.json_value() | nil}
  def __schema__, do: [{"status", :status, false, false, :string}, {"version", :version, false, false, :string}, {"type", :type, false, false, :string}, {"serverVersion", :server_version, false, false, :string}, {"openSubsonic", :open_subsonic, false, false, :boolean}, {"album", :album, false, false, :json_value}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.LibraryGetAlbumParams do
  @enforce_keys [:id]
  defstruct [:id]
  @type t :: %__MODULE__{id: String.t()}
  def __schema__, do: [{"id", :id, true, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.LibraryGetArtistOutput do
  @enforce_keys []
  defstruct [:status, :version, :type, :server_version, :open_subsonic, :artist]
  @type t :: %__MODULE__{status: String.t() | nil, version: String.t() | nil, type: String.t() | nil, server_version: String.t() | nil, open_subsonic: boolean() | nil, artist: Rocksky.Codec.json_value() | nil}
  def __schema__, do: [{"status", :status, false, false, :string}, {"version", :version, false, false, :string}, {"type", :type, false, false, :string}, {"serverVersion", :server_version, false, false, :string}, {"openSubsonic", :open_subsonic, false, false, :boolean}, {"artist", :artist, false, false, :json_value}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.LibraryGetArtistParams do
  @enforce_keys [:id]
  defstruct [:id]
  @type t :: %__MODULE__{id: String.t()}
  def __schema__, do: [{"id", :id, true, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.LibraryGetArtistsOutput do
  @enforce_keys []
  defstruct [:status, :version, :type, :server_version, :open_subsonic, :artists]
  @type t :: %__MODULE__{status: String.t() | nil, version: String.t() | nil, type: String.t() | nil, server_version: String.t() | nil, open_subsonic: boolean() | nil, artists: Rocksky.Codec.json_value() | nil}
  def __schema__, do: [{"status", :status, false, false, :string}, {"version", :version, false, false, :string}, {"type", :type, false, false, :string}, {"serverVersion", :server_version, false, false, :string}, {"openSubsonic", :open_subsonic, false, false, :boolean}, {"artists", :artists, false, false, :json_value}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.LibraryGetArtistsParams do
  @enforce_keys []
  defstruct []
  @type t :: %__MODULE__{}
  def __schema__, do: []
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.LibraryGetPlaylistOutput do
  @enforce_keys []
  defstruct [:status, :version, :type, :server_version, :open_subsonic, :playlist]
  @type t :: %__MODULE__{status: String.t() | nil, version: String.t() | nil, type: String.t() | nil, server_version: String.t() | nil, open_subsonic: boolean() | nil, playlist: Rocksky.Codec.json_value() | nil}
  def __schema__, do: [{"status", :status, false, false, :string}, {"version", :version, false, false, :string}, {"type", :type, false, false, :string}, {"serverVersion", :server_version, false, false, :string}, {"openSubsonic", :open_subsonic, false, false, :boolean}, {"playlist", :playlist, false, false, :json_value}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.LibraryGetPlaylistParams do
  @enforce_keys [:id]
  defstruct [:id]
  @type t :: %__MODULE__{id: String.t()}
  def __schema__, do: [{"id", :id, true, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.LibraryGetPlaylistsOutput do
  @enforce_keys []
  defstruct [:status, :version, :type, :server_version, :open_subsonic, :playlists]
  @type t :: %__MODULE__{status: String.t() | nil, version: String.t() | nil, type: String.t() | nil, server_version: String.t() | nil, open_subsonic: boolean() | nil, playlists: Rocksky.Codec.json_value() | nil}
  def __schema__, do: [{"status", :status, false, false, :string}, {"version", :version, false, false, :string}, {"type", :type, false, false, :string}, {"serverVersion", :server_version, false, false, :string}, {"openSubsonic", :open_subsonic, false, false, :boolean}, {"playlists", :playlists, false, false, :json_value}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.LibraryGetPlaylistsParams do
  @enforce_keys []
  defstruct []
  @type t :: %__MODULE__{}
  def __schema__, do: []
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.LibraryGetSongOutput do
  @enforce_keys []
  defstruct [:status, :version, :type, :server_version, :open_subsonic, :song]
  @type t :: %__MODULE__{status: String.t() | nil, version: String.t() | nil, type: String.t() | nil, server_version: String.t() | nil, open_subsonic: boolean() | nil, song: Rocksky.Codec.json_value() | nil}
  def __schema__, do: [{"status", :status, false, false, :string}, {"version", :version, false, false, :string}, {"type", :type, false, false, :string}, {"serverVersion", :server_version, false, false, :string}, {"openSubsonic", :open_subsonic, false, false, :boolean}, {"song", :song, false, false, :json_value}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.LibraryGetSongParams do
  @enforce_keys [:id]
  defstruct [:id]
  @type t :: %__MODULE__{id: String.t()}
  def __schema__, do: [{"id", :id, true, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.LibrarySearchOutput do
  @enforce_keys []
  defstruct [:status, :version, :type, :server_version, :open_subsonic, :search_result3]
  @type t :: %__MODULE__{status: String.t() | nil, version: String.t() | nil, type: String.t() | nil, server_version: String.t() | nil, open_subsonic: boolean() | nil, search_result3: Rocksky.Codec.json_value() | nil}
  def __schema__, do: [{"status", :status, false, false, :string}, {"version", :version, false, false, :string}, {"type", :type, false, false, :string}, {"serverVersion", :server_version, false, false, :string}, {"openSubsonic", :open_subsonic, false, false, :boolean}, {"searchResult3", :search_result3, false, false, :json_value}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.LibrarySearchParams do
  @enforce_keys [:query]
  defstruct [:query, :artist_count, :artist_offset, :album_count, :album_offset, :song_count, :song_offset]
  @type t :: %__MODULE__{query: String.t(), artist_count: integer() | nil, artist_offset: integer() | nil, album_count: integer() | nil, album_offset: integer() | nil, song_count: integer() | nil, song_offset: integer() | nil}
  def __schema__, do: [{"query", :query, true, false, :string}, {"artistCount", :artist_count, false, false, :integer}, {"artistOffset", :artist_offset, false, false, :integer}, {"albumCount", :album_count, false, false, :integer}, {"albumOffset", :album_offset, false, false, :integer}, {"songCount", :song_count, false, false, :integer}, {"songOffset", :song_offset, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.LibraryUpdatePlaylistInput do
  @enforce_keys [:playlist_id]
  defstruct [:playlist_id, :name, :comment, :song_id_to_add, :song_index_to_remove]
  @type t :: %__MODULE__{playlist_id: String.t(), name: String.t() | nil, comment: String.t() | nil, song_id_to_add: String.t() | nil, song_index_to_remove: integer() | nil}
  def __schema__, do: [{"playlistId", :playlist_id, true, false, :string}, {"name", :name, false, false, :string}, {"comment", :comment, false, false, :string}, {"songIdToAdd", :song_id_to_add, false, false, :string}, {"songIndexToRemove", :song_index_to_remove, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.LibraryUpdatePlaylistOutput do
  @enforce_keys []
  defstruct [:status, :version, :type, :server_version, :open_subsonic, :atproto_error]
  @type t :: %__MODULE__{status: String.t() | nil, version: String.t() | nil, type: String.t() | nil, server_version: String.t() | nil, open_subsonic: boolean() | nil, atproto_error: String.t() | nil}
  def __schema__, do: [{"status", :status, false, false, :string}, {"version", :version, false, false, :string}, {"type", :type, false, false, :string}, {"serverVersion", :server_version, false, false, :string}, {"openSubsonic", :open_subsonic, false, false, :boolean}, {"atprotoError", :atproto_error, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.LikeRecord do
  @enforce_keys [:created_at, :subject]
  defstruct [:created_at, :subject]
  @type t :: %__MODULE__{created_at: String.t(), subject: Rocksky.Models.StrongRef.t()}
  def __schema__, do: [{"createdAt", :created_at, true, false, :string}, {"subject", :subject, true, false, {:record, Rocksky.Models.StrongRef}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.LikeShoutInput do
  @enforce_keys []
  defstruct [:uri]
  @type t :: %__MODULE__{uri: String.t() | nil}
  def __schema__, do: [{"uri", :uri, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.LikeSongInput do
  @enforce_keys []
  defstruct [:uri]
  @type t :: %__MODULE__{uri: String.t() | nil}
  def __schema__, do: [{"uri", :uri, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.ListNotificationsOutput do
  @enforce_keys [:notifications, :unread_count]
  defstruct [:notifications, :unread_count, :cursor]
  @type t :: %__MODULE__{notifications: [Rocksky.Models.NotificationView.t()], unread_count: integer(), cursor: String.t() | nil}
  def __schema__, do: [{"notifications", :notifications, true, false, {:list, {:record, Rocksky.Models.NotificationView}}}, {"unreadCount", :unread_count, true, false, :integer}, {"cursor", :cursor, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.ListNotificationsParams do
  @enforce_keys []
  defstruct [:limit, :cursor]
  @type t :: %__MODULE__{limit: integer() | nil, cursor: String.t() | nil}
  def __schema__, do: [{"limit", :limit, false, false, :integer}, {"cursor", :cursor, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.ListPresetsOutput do
  @enforce_keys [:presets]
  defstruct [:presets]
  @type t :: %__MODULE__{presets: [Rocksky.Models.EqualizerPresetView.t()]}
  def __schema__, do: [{"presets", :presets, true, false, {:list, {:record, Rocksky.Models.EqualizerPresetView}}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.ListPresetsParams do
  @enforce_keys []
  defstruct [:did]
  @type t :: %__MODULE__{did: String.t() | nil}
  def __schema__, do: [{"did", :did, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.MatchSongParams do
  @enforce_keys [:title, :artist]
  defstruct [:title, :artist, :album, :mb_id, :isrc]
  @type t :: %__MODULE__{title: String.t(), artist: String.t(), album: String.t() | nil, mb_id: String.t() | nil, isrc: String.t() | nil}
  def __schema__, do: [{"title", :title, true, false, :string}, {"artist", :artist, true, false, :string}, {"album", :album, false, false, :string}, {"mbId", :mb_id, false, false, :string}, {"isrc", :isrc, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.MirrorSourceView do
  @enforce_keys [:provider, :enabled, :has_credentials]
  defstruct [:provider, :enabled, :push_enabled, :external_username, :has_credentials, :last_polled_at, :last_scrobble_seen_at]
  @type t :: %__MODULE__{provider: String.t(), enabled: boolean(), push_enabled: boolean() | nil, external_username: String.t() | nil, has_credentials: boolean(), last_polled_at: String.t() | nil, last_scrobble_seen_at: String.t() | nil}
  def __schema__, do: [{"provider", :provider, true, false, :string}, {"enabled", :enabled, true, false, :boolean}, {"pushEnabled", :push_enabled, false, false, :boolean}, {"externalUsername", :external_username, false, false, :string}, {"hasCredentials", :has_credentials, true, false, :boolean}, {"lastPolledAt", :last_polled_at, false, false, :string}, {"lastScrobbleSeenAt", :last_scrobble_seen_at, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.NotificationActor do
  @enforce_keys []
  defstruct [:id, :did, :handle, :display_name, :avatar]
  @type t :: %__MODULE__{id: String.t() | nil, did: String.t() | nil, handle: String.t() | nil, display_name: String.t() | nil, avatar: String.t() | nil}
  def __schema__, do: [{"id", :id, false, false, :string}, {"did", :did, false, false, :string}, {"handle", :handle, false, false, :string}, {"displayName", :display_name, false, false, :string}, {"avatar", :avatar, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.NotificationSubjectView do
  @enforce_keys [:uri]
  defstruct [:uri, :title, :artist, :album_art]
  @type t :: %__MODULE__{uri: String.t(), title: String.t() | nil, artist: String.t() | nil, album_art: String.t() | nil}
  def __schema__, do: [{"uri", :uri, true, false, :string}, {"title", :title, false, false, :string}, {"artist", :artist, false, false, :string}, {"albumArt", :album_art, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.NotificationView do
  @enforce_keys [:id, :type, :read, :created_at]
  defstruct [:id, :type, :read, :created_at, :subject_uri, :shout_id, :shout_content, :actor, :subject]
  @type t :: %__MODULE__{id: String.t(), type: String.t(), read: boolean(), created_at: String.t(), subject_uri: String.t() | nil, shout_id: String.t() | nil, shout_content: String.t() | nil, actor: Rocksky.Models.NotificationActor.t() | nil, subject: Rocksky.Models.NotificationSubjectView.t() | nil}
  def __schema__, do: [{"id", :id, true, false, :string}, {"type", :type, true, false, :string}, {"read", :read, true, false, :boolean}, {"createdAt", :created_at, true, false, :string}, {"subjectUri", :subject_uri, false, false, :string}, {"shoutId", :shout_id, false, false, :string}, {"shoutContent", :shout_content, false, false, :string}, {"actor", :actor, false, false, {:record, Rocksky.Models.NotificationActor}}, {"subject", :subject, false, false, {:record, Rocksky.Models.NotificationSubjectView}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.PingOutput do
  @enforce_keys []
  defstruct [:status, :version, :type, :server_version, :open_subsonic]
  @type t :: %__MODULE__{status: String.t() | nil, version: String.t() | nil, type: String.t() | nil, server_version: String.t() | nil, open_subsonic: boolean() | nil}
  def __schema__, do: [{"status", :status, false, false, :string}, {"version", :version, false, false, :string}, {"type", :type, false, false, :string}, {"serverVersion", :server_version, false, false, :string}, {"openSubsonic", :open_subsonic, false, false, :boolean}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.PingParams do
  @enforce_keys []
  defstruct []
  @type t :: %__MODULE__{}
  def __schema__, do: []
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.PlayDirectoryParams do
  @enforce_keys [:directory_id]
  defstruct [:player_id, :directory_id, :shuffle, :recurse, :position]
  @type t :: %__MODULE__{player_id: String.t() | nil, directory_id: String.t(), shuffle: boolean() | nil, recurse: boolean() | nil, position: integer() | nil}
  def __schema__, do: [{"playerId", :player_id, false, false, :string}, {"directoryId", :directory_id, true, false, :string}, {"shuffle", :shuffle, false, false, :boolean}, {"recurse", :recurse, false, false, :boolean}, {"position", :position, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.PlayerCurrentlyPlayingViewDetailed do
  @enforce_keys []
  defstruct [:title, :device, :shuffle_state, :repeat_state, :timestamp, :context, :progress_ms, :item, :currently_playing_type, :actions, :is_playing, :uri, :album_uri, :artist_uri, :liked]
  @type t :: %__MODULE__{title: String.t() | nil, device: Rocksky.Codec.json_value() | nil, shuffle_state: boolean() | nil, repeat_state: String.t() | nil, timestamp: integer() | nil, context: Rocksky.Codec.json_value() | nil, progress_ms: integer() | nil, item: Rocksky.Codec.json_value() | nil, currently_playing_type: String.t() | nil, actions: Rocksky.Codec.json_value() | nil, is_playing: boolean() | nil, uri: String.t() | nil, album_uri: String.t() | nil, artist_uri: String.t() | nil, liked: boolean() | nil}
  def __schema__, do: [{"title", :title, false, false, :string}, {"device", :device, false, false, :json_value}, {"shuffle_state", :shuffle_state, false, false, :boolean}, {"repeat_state", :repeat_state, false, false, :string}, {"timestamp", :timestamp, false, false, :integer}, {"context", :context, false, true, :json_value}, {"progress_ms", :progress_ms, false, true, :integer}, {"item", :item, false, true, :json_value}, {"currently_playing_type", :currently_playing_type, false, false, :string}, {"actions", :actions, false, false, :json_value}, {"is_playing", :is_playing, false, false, :boolean}, {"uri", :uri, false, true, :string}, {"albumUri", :album_uri, false, true, :string}, {"artistUri", :artist_uri, false, true, :string}, {"liked", :liked, false, false, :boolean}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.PlayerGetCurrentlyPlayingParams do
  @enforce_keys []
  defstruct [:player_id, :actor]
  @type t :: %__MODULE__{player_id: String.t() | nil, actor: String.t() | nil}
  def __schema__, do: [{"playerId", :player_id, false, false, :string}, {"actor", :actor, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.PlayerNextParams do
  @enforce_keys []
  defstruct [:player_id]
  @type t :: %__MODULE__{player_id: String.t() | nil}
  def __schema__, do: [{"playerId", :player_id, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.PlayerPauseParams do
  @enforce_keys []
  defstruct [:player_id]
  @type t :: %__MODULE__{player_id: String.t() | nil}
  def __schema__, do: [{"playerId", :player_id, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.PlayerPlaybackQueueViewDetailed do
  @enforce_keys []
  defstruct [:tracks]
  @type t :: %__MODULE__{tracks: [Rocksky.Models.SongViewBasic.t()] | nil}
  def __schema__, do: [{"tracks", :tracks, false, false, {:list, {:record, Rocksky.Models.SongViewBasic}}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.PlayerPlayParams do
  @enforce_keys []
  defstruct [:player_id]
  @type t :: %__MODULE__{player_id: String.t() | nil}
  def __schema__, do: [{"playerId", :player_id, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.PlayerPreviousParams do
  @enforce_keys []
  defstruct [:player_id]
  @type t :: %__MODULE__{player_id: String.t() | nil}
  def __schema__, do: [{"playerId", :player_id, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.PlayerSeekParams do
  @enforce_keys [:position]
  defstruct [:player_id, :position]
  @type t :: %__MODULE__{player_id: String.t() | nil, position: integer()}
  def __schema__, do: [{"playerId", :player_id, false, false, :string}, {"position", :position, true, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.PlayFileParams do
  @enforce_keys [:file_id]
  defstruct [:player_id, :file_id]
  @type t :: %__MODULE__{player_id: String.t() | nil, file_id: String.t()}
  def __schema__, do: [{"playerId", :player_id, false, false, :string}, {"fileId", :file_id, true, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.PlaylistCreatePlaylistOutput do
  @enforce_keys [:uri, :cid]
  defstruct [:uri, :cid]
  @type t :: %__MODULE__{uri: String.t(), cid: String.t()}
  def __schema__, do: [{"uri", :uri, true, false, :string}, {"cid", :cid, true, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.PlaylistCreatePlaylistParams do
  @enforce_keys [:name]
  defstruct [:name, :description, :picture_url]
  @type t :: %__MODULE__{name: String.t(), description: String.t() | nil, picture_url: String.t() | nil}
  def __schema__, do: [{"name", :name, true, false, :string}, {"description", :description, false, false, :string}, {"pictureUrl", :picture_url, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.PlaylistGetPlaylistParams do
  @enforce_keys [:uri]
  defstruct [:uri, :filter]
  @type t :: %__MODULE__{uri: String.t(), filter: String.t() | nil}
  def __schema__, do: [{"uri", :uri, true, false, :string}, {"filter", :filter, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.PlaylistGetPlaylistsOutput do
  @enforce_keys []
  defstruct [:playlists]
  @type t :: %__MODULE__{playlists: [Rocksky.Models.PlaylistViewBasic.t()] | nil}
  def __schema__, do: [{"playlists", :playlists, false, false, {:list, {:record, Rocksky.Models.PlaylistViewBasic}}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.PlaylistGetPlaylistsParams do
  @enforce_keys []
  defstruct [:limit, :offset, :filter]
  @type t :: %__MODULE__{limit: integer() | nil, offset: integer() | nil, filter: String.t() | nil}
  def __schema__, do: [{"limit", :limit, false, false, :integer}, {"offset", :offset, false, false, :integer}, {"filter", :filter, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.PlaylistRecord do
  @enforce_keys [:name, :created_at]
  defstruct [:name, :description, :picture, :picture_url, :created_at, :spotify_link, :tidal_link, :youtube_link, :apple_music_link]
  @type t :: %__MODULE__{name: String.t(), description: String.t() | nil, picture: Rocksky.Models.BlobRef.t() | nil, picture_url: String.t() | nil, created_at: String.t(), spotify_link: String.t() | nil, tidal_link: String.t() | nil, youtube_link: String.t() | nil, apple_music_link: String.t() | nil}
  def __schema__, do: [{"name", :name, true, false, :string}, {"description", :description, false, false, :string}, {"picture", :picture, false, false, {:record, Rocksky.Models.BlobRef}}, {"pictureUrl", :picture_url, false, false, :string}, {"createdAt", :created_at, true, false, :string}, {"spotifyLink", :spotify_link, false, false, :string}, {"tidalLink", :tidal_link, false, false, :string}, {"youtubeLink", :youtube_link, false, false, :string}, {"appleMusicLink", :apple_music_link, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.PlaylistSongRecord do
  @enforce_keys [:playlist, :song, :title, :artist, :album, :album_artist, :duration, :added_at]
  defstruct [:playlist, :song, :title, :artist, :album, :album_artist, :duration, :album_art_url, :added_at]
  @type t :: %__MODULE__{playlist: Rocksky.Models.StrongRef.t(), song: Rocksky.Models.StrongRef.t(), title: String.t(), artist: String.t(), album: String.t(), album_artist: String.t(), duration: integer(), album_art_url: String.t() | nil, added_at: String.t()}
  def __schema__, do: [{"playlist", :playlist, true, false, {:record, Rocksky.Models.StrongRef}}, {"song", :song, true, false, {:record, Rocksky.Models.StrongRef}}, {"title", :title, true, false, :string}, {"artist", :artist, true, false, :string}, {"album", :album, true, false, :string}, {"albumArtist", :album_artist, true, false, :string}, {"duration", :duration, true, false, :integer}, {"albumArtUrl", :album_art_url, false, false, :string}, {"addedAt", :added_at, true, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.PlaylistUpdatePlaylistOutput do
  @enforce_keys [:uri, :cid]
  defstruct [:uri, :cid]
  @type t :: %__MODULE__{uri: String.t(), cid: String.t()}
  def __schema__, do: [{"uri", :uri, true, false, :string}, {"cid", :cid, true, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.PlaylistUpdatePlaylistParams do
  @enforce_keys [:uri]
  defstruct [:uri, :name, :description, :picture_url]
  @type t :: %__MODULE__{uri: String.t(), name: String.t() | nil, description: String.t() | nil, picture_url: String.t() | nil}
  def __schema__, do: [{"uri", :uri, true, false, :string}, {"name", :name, false, false, :string}, {"description", :description, false, false, :string}, {"pictureUrl", :picture_url, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.PlaylistViewBasic do
  @enforce_keys []
  defstruct [:id, :title, :uri, :curator_did, :curator_handle, :curator_name, :curator_avatar_url, :description, :cover_image_url, :created_at, :track_count, :track_arts, :updated_at, :curator_d_id]
  @type t :: %__MODULE__{id: String.t() | nil, title: String.t() | nil, uri: String.t() | nil, curator_did: String.t() | nil, curator_handle: String.t() | nil, curator_name: String.t() | nil, curator_avatar_url: String.t() | nil, description: String.t() | nil, cover_image_url: String.t() | nil, created_at: String.t() | nil, track_count: integer() | nil, track_arts: [String.t()] | nil, updated_at: String.t() | nil, curator_d_id: String.t() | nil}
  def __schema__, do: [{"id", :id, false, false, :string}, {"title", :title, false, false, :string}, {"uri", :uri, false, false, :string}, {"curatorDid", :curator_did, false, false, :string}, {"curatorHandle", :curator_handle, false, false, :string}, {"curatorName", :curator_name, false, false, :string}, {"curatorAvatarUrl", :curator_avatar_url, false, false, :string}, {"description", :description, false, false, :string}, {"coverImageUrl", :cover_image_url, false, true, :string}, {"createdAt", :created_at, false, false, :string}, {"trackCount", :track_count, false, false, :integer}, {"trackArts", :track_arts, false, false, {:list, :string}}, {"updatedAt", :updated_at, false, false, :string}, {"curatorDId", :curator_d_id, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.PlaylistViewDetailed do
  @enforce_keys []
  defstruct [:id, :title, :uri, :curator_did, :curator_handle, :curator_name, :curator_avatar_url, :description, :cover_image_url, :created_at, :tracks, :curator_d_id, :updated_at, :track_count]
  @type t :: %__MODULE__{id: String.t() | nil, title: String.t() | nil, uri: String.t() | nil, curator_did: String.t() | nil, curator_handle: String.t() | nil, curator_name: String.t() | nil, curator_avatar_url: String.t() | nil, description: String.t() | nil, cover_image_url: String.t() | nil, created_at: String.t() | nil, tracks: [Rocksky.Models.SongViewBasic.t()] | nil, curator_d_id: String.t() | nil, updated_at: String.t() | nil, track_count: integer() | nil}
  def __schema__, do: [{"id", :id, false, false, :string}, {"title", :title, false, false, :string}, {"uri", :uri, false, false, :string}, {"curatorDid", :curator_did, false, false, :string}, {"curatorHandle", :curator_handle, false, false, :string}, {"curatorName", :curator_name, false, false, :string}, {"curatorAvatarUrl", :curator_avatar_url, false, false, :string}, {"description", :description, false, false, :string}, {"coverImageUrl", :cover_image_url, false, true, :string}, {"createdAt", :created_at, false, false, :string}, {"tracks", :tracks, false, false, {:list, {:record, Rocksky.Models.SongViewBasic}}}, {"curatorDId", :curator_d_id, false, false, :string}, {"updatedAt", :updated_at, false, false, :string}, {"trackCount", :track_count, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.ProfileRecord do
  @enforce_keys []
  defstruct [:display_name, :description, :avatar, :banner, :labels, :joined_via_starter_pack, :created_at]
  @type t :: %__MODULE__{display_name: String.t() | nil, description: String.t() | nil, avatar: Rocksky.Models.BlobRef.t() | nil, banner: Rocksky.Models.BlobRef.t() | nil, labels: Rocksky.Codec.json_value() | nil, joined_via_starter_pack: Rocksky.Models.StrongRef.t() | nil, created_at: String.t() | nil}
  def __schema__, do: [{"displayName", :display_name, false, false, :string}, {"description", :description, false, false, :string}, {"avatar", :avatar, false, false, {:record, Rocksky.Models.BlobRef}}, {"banner", :banner, false, false, {:record, Rocksky.Models.BlobRef}}, {"labels", :labels, false, false, :json_value}, {"joinedViaStarterPack", :joined_via_starter_pack, false, false, {:record, Rocksky.Models.StrongRef}}, {"createdAt", :created_at, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.PutAudioSettingsInput do
  @enforce_keys []
  defstruct [:crossfade, :equalizer, :replay_gain, :tone]
  @type t :: %__MODULE__{crossfade: Rocksky.Models.RockboxCrossfadeSettings.t() | nil, equalizer: Rocksky.Models.RockboxEqualizerSettings.t() | nil, replay_gain: Rocksky.Models.RockboxReplayGainSettings.t() | nil, tone: Rocksky.Models.RockboxToneSettings.t() | nil}
  def __schema__, do: [{"crossfade", :crossfade, false, false, {:record, Rocksky.Models.RockboxCrossfadeSettings}}, {"equalizer", :equalizer, false, false, {:record, Rocksky.Models.RockboxEqualizerSettings}}, {"replayGain", :replay_gain, false, false, {:record, Rocksky.Models.RockboxReplayGainSettings}}, {"tone", :tone, false, false, {:record, Rocksky.Models.RockboxToneSettings}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.PutMirrorSourceInput do
  @enforce_keys [:provider]
  defstruct [:provider, :enabled, :push_enabled, :external_username, :api_key]
  @type t :: %__MODULE__{provider: String.t(), enabled: boolean() | nil, push_enabled: boolean() | nil, external_username: String.t() | nil, api_key: String.t() | nil}
  def __schema__, do: [{"provider", :provider, true, false, :string}, {"enabled", :enabled, false, false, :boolean}, {"pushEnabled", :push_enabled, false, false, :boolean}, {"externalUsername", :external_username, false, false, :string}, {"apiKey", :api_key, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.PutPresetInput do
  @enforce_keys [:name, :bands]
  defstruct [:name, :precut, :bands]
  @type t :: %__MODULE__{name: String.t(), precut: integer() | nil, bands: [Rocksky.Models.RockboxEqualizerBand.t()]}
  def __schema__, do: [{"name", :name, true, false, :string}, {"precut", :precut, false, false, :integer}, {"bands", :bands, true, false, {:list, {:record, Rocksky.Models.RockboxEqualizerBand}}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.RadioRecord do
  @enforce_keys [:name, :url, :created_at]
  defstruct [:name, :url, :description, :genre, :logo, :website, :created_at]
  @type t :: %__MODULE__{name: String.t(), url: String.t(), description: String.t() | nil, genre: String.t() | nil, logo: Rocksky.Models.BlobRef.t() | nil, website: String.t() | nil, created_at: String.t()}
  def __schema__, do: [{"name", :name, true, false, :string}, {"url", :url, true, false, :string}, {"description", :description, false, false, :string}, {"genre", :genre, false, false, :string}, {"logo", :logo, false, false, {:record, Rocksky.Models.BlobRef}}, {"website", :website, false, false, :string}, {"createdAt", :created_at, true, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.RadioViewBasic do
  @enforce_keys []
  defstruct [:id, :name, :description, :created_at]
  @type t :: %__MODULE__{id: String.t() | nil, name: String.t() | nil, description: String.t() | nil, created_at: String.t() | nil}
  def __schema__, do: [{"id", :id, false, false, :string}, {"name", :name, false, false, :string}, {"description", :description, false, false, :string}, {"createdAt", :created_at, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.RadioViewDetailed do
  @enforce_keys []
  defstruct [:id, :name, :description, :website, :url, :genre, :logo, :created_at]
  @type t :: %__MODULE__{id: String.t() | nil, name: String.t() | nil, description: String.t() | nil, website: String.t() | nil, url: String.t() | nil, genre: String.t() | nil, logo: String.t() | nil, created_at: String.t() | nil}
  def __schema__, do: [{"id", :id, false, false, :string}, {"name", :name, false, false, :string}, {"description", :description, false, false, :string}, {"website", :website, false, false, :string}, {"url", :url, false, false, :string}, {"genre", :genre, false, false, :string}, {"logo", :logo, false, false, :string}, {"createdAt", :created_at, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.RemoveApikeyParams do
  @enforce_keys [:id]
  defstruct [:id]
  @type t :: %__MODULE__{id: String.t()}
  def __schema__, do: [{"id", :id, true, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.RemovePlaylistParams do
  @enforce_keys [:uri]
  defstruct [:uri]
  @type t :: %__MODULE__{uri: String.t()}
  def __schema__, do: [{"uri", :uri, true, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.RemoveShoutParams do
  @enforce_keys [:id]
  defstruct [:id]
  @type t :: %__MODULE__{id: String.t()}
  def __schema__, do: [{"id", :id, true, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.RemoveTrackParams do
  @enforce_keys [:uri]
  defstruct [:uri, :song_uri, :index]
  @type t :: %__MODULE__{uri: String.t(), song_uri: String.t() | nil, index: integer() | nil}
  def __schema__, do: [{"uri", :uri, true, false, :string}, {"songUri", :song_uri, false, false, :string}, {"index", :index, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.ReplyShoutInput do
  @enforce_keys [:shout_id, :message]
  defstruct [:shout_id, :message]
  @type t :: %__MODULE__{shout_id: String.t(), message: String.t()}
  def __schema__, do: [{"shoutId", :shout_id, true, false, :string}, {"message", :message, true, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.ReportShoutInput do
  @enforce_keys [:shout_id]
  defstruct [:shout_id, :reason]
  @type t :: %__MODULE__{shout_id: String.t(), reason: String.t() | nil}
  def __schema__, do: [{"shoutId", :shout_id, true, false, :string}, {"reason", :reason, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.RockboxCrossfadeSettings do
  @enforce_keys []
  defstruct [:mode, :fade_in_delay, :fade_in_duration, :fade_out_delay, :fade_out_duration, :fade_out_mix_mode]
  @type t :: %__MODULE__{mode: String.t() | nil, fade_in_delay: integer() | nil, fade_in_duration: integer() | nil, fade_out_delay: integer() | nil, fade_out_duration: integer() | nil, fade_out_mix_mode: String.t() | nil}
  def __schema__, do: [{"mode", :mode, false, false, :string}, {"fadeInDelay", :fade_in_delay, false, false, :integer}, {"fadeInDuration", :fade_in_duration, false, false, :integer}, {"fadeOutDelay", :fade_out_delay, false, false, :integer}, {"fadeOutDuration", :fade_out_duration, false, false, :integer}, {"fadeOutMixMode", :fade_out_mix_mode, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.RockboxEqualizerBand do
  @enforce_keys [:frequency, :gain, :q]
  defstruct [:frequency, :gain, :q]
  @type t :: %__MODULE__{frequency: integer(), gain: integer(), q: integer()}
  def __schema__, do: [{"frequency", :frequency, true, false, :integer}, {"gain", :gain, true, false, :integer}, {"q", :q, true, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.RockboxEqualizerSettings do
  @enforce_keys []
  defstruct [:enabled, :precut, :bands]
  @type t :: %__MODULE__{enabled: boolean() | nil, precut: integer() | nil, bands: [Rocksky.Models.RockboxEqualizerBand.t()] | nil}
  def __schema__, do: [{"enabled", :enabled, false, false, :boolean}, {"precut", :precut, false, false, :integer}, {"bands", :bands, false, false, {:list, {:record, Rocksky.Models.RockboxEqualizerBand}}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.RockboxReplayGainSettings do
  @enforce_keys []
  defstruct [:mode, :preamp, :prevent_clipping]
  @type t :: %__MODULE__{mode: String.t() | nil, preamp: integer() | nil, prevent_clipping: boolean() | nil}
  def __schema__, do: [{"mode", :mode, false, false, :string}, {"preamp", :preamp, false, false, :integer}, {"preventClipping", :prevent_clipping, false, false, :boolean}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.RockboxSettingsView do
  @enforce_keys [:created_at]
  defstruct [:crossfade, :equalizer, :replay_gain, :tone, :created_at, :updated_at]
  @type t :: %__MODULE__{crossfade: Rocksky.Models.RockboxCrossfadeSettings.t() | nil, equalizer: Rocksky.Models.RockboxEqualizerSettings.t() | nil, replay_gain: Rocksky.Models.RockboxReplayGainSettings.t() | nil, tone: Rocksky.Models.RockboxToneSettings.t() | nil, created_at: String.t(), updated_at: String.t() | nil}
  def __schema__, do: [{"crossfade", :crossfade, false, false, {:record, Rocksky.Models.RockboxCrossfadeSettings}}, {"equalizer", :equalizer, false, false, {:record, Rocksky.Models.RockboxEqualizerSettings}}, {"replayGain", :replay_gain, false, false, {:record, Rocksky.Models.RockboxReplayGainSettings}}, {"tone", :tone, false, false, {:record, Rocksky.Models.RockboxToneSettings}}, {"createdAt", :created_at, true, false, :string}, {"updatedAt", :updated_at, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.RockboxToneSettings do
  @enforce_keys []
  defstruct [:bass, :treble, :balance, :channels]
  @type t :: %__MODULE__{bass: integer() | nil, treble: integer() | nil, balance: integer() | nil, channels: String.t() | nil}
  def __schema__, do: [{"bass", :bass, false, false, :integer}, {"treble", :treble, false, false, :integer}, {"balance", :balance, false, false, :integer}, {"channels", :channels, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.SavePlayQueueInput do
  @enforce_keys []
  defstruct [:id, :current, :position]
  @type t :: %__MODULE__{id: String.t() | nil, current: String.t() | nil, position: integer() | nil}
  def __schema__, do: [{"id", :id, false, false, :string}, {"current", :current, false, false, :string}, {"position", :position, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.SavePlayQueueOutput do
  @enforce_keys []
  defstruct [:status, :version, :type, :server_version, :open_subsonic]
  @type t :: %__MODULE__{status: String.t() | nil, version: String.t() | nil, type: String.t() | nil, server_version: String.t() | nil, open_subsonic: boolean() | nil}
  def __schema__, do: [{"status", :status, false, false, :string}, {"version", :version, false, false, :string}, {"type", :type, false, false, :string}, {"serverVersion", :server_version, false, false, :string}, {"openSubsonic", :open_subsonic, false, false, :boolean}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.ScrobbleFirstScrobbleView do
  @enforce_keys []
  defstruct [:handle, :avatar, :timestamp]
  @type t :: %__MODULE__{handle: String.t() | nil, avatar: String.t() | nil, timestamp: String.t() | nil}
  def __schema__, do: [{"handle", :handle, false, false, :string}, {"avatar", :avatar, false, false, :string}, {"timestamp", :timestamp, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.ScrobbleInput do
  @enforce_keys [:id]
  defstruct [:id, :time, :submission]
  @type t :: %__MODULE__{id: String.t(), time: integer() | nil, submission: boolean() | nil}
  def __schema__, do: [{"id", :id, true, false, :string}, {"time", :time, false, false, :integer}, {"submission", :submission, false, false, :boolean}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.ScrobbleOutput do
  @enforce_keys []
  defstruct [:status, :version, :type, :server_version, :open_subsonic]
  @type t :: %__MODULE__{status: String.t() | nil, version: String.t() | nil, type: String.t() | nil, server_version: String.t() | nil, open_subsonic: boolean() | nil}
  def __schema__, do: [{"status", :status, false, false, :string}, {"version", :version, false, false, :string}, {"type", :type, false, false, :string}, {"serverVersion", :server_version, false, false, :string}, {"openSubsonic", :open_subsonic, false, false, :boolean}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.ScrobbleRecord do
  @enforce_keys [:title, :artist, :album_artist, :album, :duration, :created_at]
  defstruct [:title, :artist, :artists, :album_artist, :album, :duration, :track_number, :disc_number, :release_date, :year, :genre, :tags, :composer, :lyrics, :copyright_message, :wiki, :album_art, :album_art_url, :youtube_link, :spotify_link, :tidal_link, :apple_music_link, :created_at, :mbid, :label, :isrc]
  @type t :: %__MODULE__{title: String.t(), artist: String.t(), artists: [Rocksky.Models.ArtistMbid.t()] | nil, album_artist: String.t(), album: String.t(), duration: integer(), track_number: integer() | nil, disc_number: integer() | nil, release_date: String.t() | nil, year: integer() | nil, genre: String.t() | nil, tags: [String.t()] | nil, composer: String.t() | nil, lyrics: String.t() | nil, copyright_message: String.t() | nil, wiki: String.t() | nil, album_art: Rocksky.Models.BlobRef.t() | nil, album_art_url: String.t() | nil, youtube_link: String.t() | nil, spotify_link: String.t() | nil, tidal_link: String.t() | nil, apple_music_link: String.t() | nil, created_at: String.t(), mbid: String.t() | nil, label: String.t() | nil, isrc: String.t() | nil}
  def __schema__, do: [{"title", :title, true, false, :string}, {"artist", :artist, true, false, :string}, {"artists", :artists, false, false, {:list, {:record, Rocksky.Models.ArtistMbid}}}, {"albumArtist", :album_artist, true, false, :string}, {"album", :album, true, false, :string}, {"duration", :duration, true, false, :integer}, {"trackNumber", :track_number, false, false, :integer}, {"discNumber", :disc_number, false, false, :integer}, {"releaseDate", :release_date, false, false, :string}, {"year", :year, false, false, :integer}, {"genre", :genre, false, false, :string}, {"tags", :tags, false, false, {:list, :string}}, {"composer", :composer, false, false, :string}, {"lyrics", :lyrics, false, false, :string}, {"copyrightMessage", :copyright_message, false, false, :string}, {"wiki", :wiki, false, false, :string}, {"albumArt", :album_art, false, false, {:record, Rocksky.Models.BlobRef}}, {"albumArtUrl", :album_art_url, false, false, :string}, {"youtubeLink", :youtube_link, false, false, :string}, {"spotifyLink", :spotify_link, false, false, :string}, {"tidalLink", :tidal_link, false, false, :string}, {"appleMusicLink", :apple_music_link, false, false, :string}, {"createdAt", :created_at, true, false, :string}, {"mbid", :mbid, false, false, :string}, {"label", :label, false, false, :string}, {"isrc", :isrc, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.ScrobbleViewBasic do
  @enforce_keys []
  defstruct [:id, :track_id, :title, :artist, :artist_uri, :album_artist, :album, :album_uri, :album_art, :track_uri, :handle, :did, :avatar, :created_at, :uri, :sha256, :liked, :likes_count, :cover, :date, :user, :user_display_name, :user_avatar, :tags, :mb_id, :mbid, :isrc, :spotify_link, :composer, :track_number, :duration, :youtube_link, :apple_music_link, :tidal_link, :disc_number, :genre, :label, :copyright_message, :key, :xata_version, :bpm, :updated_at]
  @type t :: %__MODULE__{id: String.t() | nil, track_id: String.t() | nil, title: String.t() | nil, artist: String.t() | nil, artist_uri: String.t() | nil, album_artist: String.t() | nil, album: String.t() | nil, album_uri: String.t() | nil, album_art: String.t() | nil, track_uri: String.t() | nil, handle: String.t() | nil, did: String.t() | nil, avatar: String.t() | nil, created_at: String.t() | nil, uri: String.t() | nil, sha256: String.t() | nil, liked: boolean() | nil, likes_count: integer() | nil, cover: String.t() | nil, date: String.t() | nil, user: String.t() | nil, user_display_name: String.t() | nil, user_avatar: String.t() | nil, tags: [String.t()] | nil, mb_id: String.t() | nil, mbid: String.t() | nil, isrc: String.t() | nil, spotify_link: String.t() | nil, composer: String.t() | nil, track_number: integer() | nil, duration: integer() | nil, youtube_link: String.t() | nil, apple_music_link: String.t() | nil, tidal_link: String.t() | nil, disc_number: integer() | nil, genre: String.t() | nil, label: String.t() | nil, copyright_message: String.t() | nil, key: String.t() | nil, xata_version: integer() | nil, bpm: float() | nil, updated_at: Rocksky.Codec.json_value() | nil}
  def __schema__, do: [{"id", :id, false, false, :string}, {"trackId", :track_id, false, true, :string}, {"title", :title, false, false, :string}, {"artist", :artist, false, false, :string}, {"artistUri", :artist_uri, false, true, :string}, {"albumArtist", :album_artist, false, true, :string}, {"album", :album, false, false, :string}, {"albumUri", :album_uri, false, true, :string}, {"albumArt", :album_art, false, true, :string}, {"trackUri", :track_uri, false, true, :string}, {"handle", :handle, false, false, :string}, {"did", :did, false, false, :string}, {"avatar", :avatar, false, false, :string}, {"createdAt", :created_at, false, false, :string}, {"uri", :uri, false, true, :string}, {"sha256", :sha256, false, false, :string}, {"liked", :liked, false, false, :boolean}, {"likesCount", :likes_count, false, false, :integer}, {"cover", :cover, false, true, :string}, {"date", :date, false, false, :string}, {"user", :user, false, false, :string}, {"userDisplayName", :user_display_name, false, false, :string}, {"userAvatar", :user_avatar, false, false, :string}, {"tags", :tags, false, true, {:list, :string}}, {"mbId", :mb_id, false, true, :string}, {"mbid", :mbid, false, true, :string}, {"isrc", :isrc, false, true, :string}, {"spotifyLink", :spotify_link, false, true, :string}, {"composer", :composer, false, true, :string}, {"trackNumber", :track_number, false, true, :integer}, {"duration", :duration, false, false, :integer}, {"youtubeLink", :youtube_link, false, true, :string}, {"appleMusicLink", :apple_music_link, false, true, :string}, {"tidalLink", :tidal_link, false, true, :string}, {"discNumber", :disc_number, false, false, :integer}, {"genre", :genre, false, true, :string}, {"label", :label, false, true, :string}, {"copyrightMessage", :copyright_message, false, true, :string}, {"key", :key, false, true, :string}, {"xataVersion", :xata_version, false, false, :integer}, {"bpm", :bpm, false, false, :float}, {"updatedAt", :updated_at, false, false, :json_value}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.ScrobbleViewDetailed do
  @enforce_keys []
  defstruct [:id, :user, :title, :artist, :artist_uri, :album, :album_uri, :cover, :date, :uri, :sha256, :liked, :track_uri, :likes_count, :listeners, :scrobbles, :artists, :first_scrobble, :mb_id, :isrc, :tags, :created_at, :updated_at, :album_artist, :track_number, :duration, :youtube_link, :spotify_link, :apple_music_link, :tidal_link, :disc_number, :lyrics, :composer, :genre, :label, :copyright_message, :key, :acoustid_fingerprint, :xata_version, :mbid, :bpm]
  @type t :: %__MODULE__{id: String.t() | nil, user: String.t() | nil, title: String.t() | nil, artist: String.t() | nil, artist_uri: String.t() | nil, album: String.t() | nil, album_uri: String.t() | nil, cover: String.t() | nil, date: String.t() | nil, uri: String.t() | nil, sha256: String.t() | nil, liked: boolean() | nil, track_uri: String.t() | nil, likes_count: integer() | nil, listeners: integer() | nil, scrobbles: integer() | nil, artists: [Rocksky.Models.ArtistViewBasic.t()] | nil, first_scrobble: Rocksky.Models.ScrobbleFirstScrobbleView.t() | nil, mb_id: String.t() | nil, isrc: String.t() | nil, tags: [String.t()] | nil, created_at: String.t() | nil, updated_at: String.t() | nil, album_artist: String.t() | nil, track_number: integer() | nil, duration: integer() | nil, youtube_link: String.t() | nil, spotify_link: String.t() | nil, apple_music_link: String.t() | nil, tidal_link: String.t() | nil, disc_number: integer() | nil, lyrics: String.t() | nil, composer: String.t() | nil, genre: String.t() | nil, label: String.t() | nil, copyright_message: String.t() | nil, key: String.t() | nil, acoustid_fingerprint: String.t() | nil, xata_version: integer() | nil, mbid: String.t() | nil, bpm: float() | nil}
  def __schema__, do: [{"id", :id, false, false, :string}, {"user", :user, false, false, :string}, {"title", :title, false, false, :string}, {"artist", :artist, false, false, :string}, {"artistUri", :artist_uri, false, true, :string}, {"album", :album, false, false, :string}, {"albumUri", :album_uri, false, false, :string}, {"cover", :cover, false, false, :string}, {"date", :date, false, false, :string}, {"uri", :uri, false, true, :string}, {"sha256", :sha256, false, false, :string}, {"liked", :liked, false, false, :boolean}, {"trackUri", :track_uri, false, false, :string}, {"likesCount", :likes_count, false, false, :integer}, {"listeners", :listeners, false, false, :integer}, {"scrobbles", :scrobbles, false, false, :integer}, {"artists", :artists, false, false, {:list, {:record, Rocksky.Models.ArtistViewBasic}}}, {"firstScrobble", :first_scrobble, false, false, {:record, Rocksky.Models.ScrobbleFirstScrobbleView}}, {"mbId", :mb_id, false, true, :string}, {"isrc", :isrc, false, true, :string}, {"tags", :tags, false, false, {:list, :string}}, {"createdAt", :created_at, false, false, :string}, {"updatedAt", :updated_at, false, false, :string}, {"albumArtist", :album_artist, false, true, :string}, {"trackNumber", :track_number, false, true, :integer}, {"duration", :duration, false, false, :integer}, {"youtubeLink", :youtube_link, false, true, :string}, {"spotifyLink", :spotify_link, false, true, :string}, {"appleMusicLink", :apple_music_link, false, true, :string}, {"tidalLink", :tidal_link, false, true, :string}, {"discNumber", :disc_number, false, true, :integer}, {"lyrics", :lyrics, false, true, :string}, {"composer", :composer, false, true, :string}, {"genre", :genre, false, true, :string}, {"label", :label, false, true, :string}, {"copyrightMessage", :copyright_message, false, true, :string}, {"key", :key, false, true, :string}, {"acoustidFingerprint", :acoustid_fingerprint, false, true, :string}, {"xataVersion", :xata_version, false, true, :integer}, {"mbid", :mbid, false, true, :string}, {"bpm", :bpm, false, false, :float}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.SettingsRecord do
  @enforce_keys [:created_at]
  defstruct [:crossfade, :equalizer, :replay_gain, :tone, :created_at, :updated_at]
  @type t :: %__MODULE__{crossfade: Rocksky.Models.RockboxCrossfadeSettings.t() | nil, equalizer: Rocksky.Models.RockboxEqualizerSettings.t() | nil, replay_gain: Rocksky.Models.RockboxReplayGainSettings.t() | nil, tone: Rocksky.Models.RockboxToneSettings.t() | nil, created_at: String.t(), updated_at: String.t() | nil}
  def __schema__, do: [{"crossfade", :crossfade, false, false, {:record, Rocksky.Models.RockboxCrossfadeSettings}}, {"equalizer", :equalizer, false, false, {:record, Rocksky.Models.RockboxEqualizerSettings}}, {"replayGain", :replay_gain, false, false, {:record, Rocksky.Models.RockboxReplayGainSettings}}, {"tone", :tone, false, false, {:record, Rocksky.Models.RockboxToneSettings}}, {"createdAt", :created_at, true, false, :string}, {"updatedAt", :updated_at, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.ShoutAuthor do
  @enforce_keys []
  defstruct [:id, :did, :handle, :display_name, :avatar]
  @type t :: %__MODULE__{id: String.t() | nil, did: String.t() | nil, handle: String.t() | nil, display_name: String.t() | nil, avatar: String.t() | nil}
  def __schema__, do: [{"id", :id, false, false, :string}, {"did", :did, false, false, :string}, {"handle", :handle, false, false, :string}, {"displayName", :display_name, false, true, :string}, {"avatar", :avatar, false, true, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.ShoutGif do
  @enforce_keys [:url]
  defstruct [:url, :preview_url, :alt, :width, :height]
  @type t :: %__MODULE__{url: String.t(), preview_url: String.t() | nil, alt: String.t() | nil, width: integer() | nil, height: integer() | nil}
  def __schema__, do: [{"url", :url, true, false, :string}, {"previewUrl", :preview_url, false, false, :string}, {"alt", :alt, false, false, :string}, {"width", :width, false, false, :integer}, {"height", :height, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.ShoutMention do
  @enforce_keys [:did, :byte_start, :byte_end]
  defstruct [:did, :byte_start, :byte_end]
  @type t :: %__MODULE__{did: String.t(), byte_start: integer(), byte_end: integer()}
  def __schema__, do: [{"did", :did, true, false, :string}, {"byteStart", :byte_start, true, false, :integer}, {"byteEnd", :byte_end, true, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.ShoutRecord do
  @enforce_keys [:created_at, :subject]
  defstruct [:message, :created_at, :parent, :subject, :gif, :facets]
  @type t :: %__MODULE__{message: String.t() | nil, created_at: String.t(), parent: Rocksky.Models.StrongRef.t() | nil, subject: Rocksky.Models.StrongRef.t(), gif: Rocksky.Models.ShoutGif.t() | nil, facets: [Rocksky.Models.ShoutMention.t()] | nil}
  def __schema__, do: [{"message", :message, false, false, :string}, {"createdAt", :created_at, true, false, :string}, {"parent", :parent, false, false, {:record, Rocksky.Models.StrongRef}}, {"subject", :subject, true, false, {:record, Rocksky.Models.StrongRef}}, {"gif", :gif, false, false, {:record, Rocksky.Models.ShoutGif}}, {"facets", :facets, false, false, {:list, {:record, Rocksky.Models.ShoutMention}}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.ShoutView do
  @enforce_keys []
  defstruct [:id, :message, :parent, :created_at, :author, :gif, :facets, :content, :uri, :likes, :liked]
  @type t :: %__MODULE__{id: String.t() | nil, message: String.t() | nil, parent: String.t() | nil, created_at: String.t() | nil, author: Rocksky.Models.ShoutAuthor.t() | nil, gif: Rocksky.Models.ShoutGif.t() | nil, facets: [Rocksky.Models.ShoutMention.t()] | nil, content: String.t() | nil, uri: String.t() | nil, likes: integer() | nil, liked: boolean() | nil}
  def __schema__, do: [{"id", :id, false, false, :string}, {"message", :message, false, false, :string}, {"parent", :parent, false, true, :string}, {"createdAt", :created_at, false, false, :string}, {"author", :author, false, false, {:record, Rocksky.Models.ShoutAuthor}}, {"gif", :gif, false, false, {:record, Rocksky.Models.ShoutGif}}, {"facets", :facets, false, false, {:list, {:record, Rocksky.Models.ShoutMention}}}, {"content", :content, false, false, :string}, {"uri", :uri, false, false, :string}, {"likes", :likes, false, false, :integer}, {"liked", :liked, false, false, :boolean}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.SongFirstScrobbleView do
  @enforce_keys []
  defstruct [:handle, :avatar, :timestamp]
  @type t :: %__MODULE__{handle: String.t() | nil, avatar: String.t() | nil, timestamp: String.t() | nil}
  def __schema__, do: [{"handle", :handle, false, false, :string}, {"avatar", :avatar, false, false, :string}, {"timestamp", :timestamp, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.SongGetSongParams do
  @enforce_keys []
  defstruct [:uri, :mbid, :isrc, :spotify_id]
  @type t :: %__MODULE__{uri: String.t() | nil, mbid: String.t() | nil, isrc: String.t() | nil, spotify_id: String.t() | nil}
  def __schema__, do: [{"uri", :uri, false, false, :string}, {"mbid", :mbid, false, false, :string}, {"isrc", :isrc, false, false, :string}, {"spotifyId", :spotify_id, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.SongMatchView do
  @enforce_keys []
  defstruct [:id, :title, :artist, :album, :album_art, :isrc, :duration_ms, :track_number, :disc_number, :link, :preview, :rank, :explicit, :score]
  @type t :: %__MODULE__{id: integer() | nil, title: String.t() | nil, artist: String.t() | nil, album: String.t() | nil, album_art: String.t() | nil, isrc: String.t() | nil, duration_ms: integer() | nil, track_number: integer() | nil, disc_number: integer() | nil, link: String.t() | nil, preview: String.t() | nil, rank: integer() | nil, explicit: boolean() | nil, score: integer() | nil}
  def __schema__, do: [{"id", :id, false, false, :integer}, {"title", :title, false, false, :string}, {"artist", :artist, false, false, :string}, {"album", :album, false, false, :string}, {"albumArt", :album_art, false, false, :string}, {"isrc", :isrc, false, false, :string}, {"durationMs", :duration_ms, false, false, :integer}, {"trackNumber", :track_number, false, false, :integer}, {"discNumber", :disc_number, false, false, :integer}, {"link", :link, false, false, :string}, {"preview", :preview, false, false, :string}, {"rank", :rank, false, false, :integer}, {"explicit", :explicit, false, false, :boolean}, {"score", :score, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.SongRecentListenerView do
  @enforce_keys []
  defstruct [:id, :did, :handle, :display_name, :avatar, :timestamp, :scrobble_uri]
  @type t :: %__MODULE__{id: String.t() | nil, did: String.t() | nil, handle: String.t() | nil, display_name: String.t() | nil, avatar: String.t() | nil, timestamp: String.t() | nil, scrobble_uri: String.t() | nil}
  def __schema__, do: [{"id", :id, false, false, :string}, {"did", :did, false, false, :string}, {"handle", :handle, false, false, :string}, {"displayName", :display_name, false, false, :string}, {"avatar", :avatar, false, false, :string}, {"timestamp", :timestamp, false, false, :string}, {"scrobbleUri", :scrobble_uri, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.SongRecord do
  @enforce_keys [:title, :artist, :album_artist, :album, :duration, :created_at]
  defstruct [:title, :artist, :artists, :album_artist, :album, :duration, :track_number, :disc_number, :release_date, :year, :genre, :tags, :composer, :lyrics, :copyright_message, :wiki, :album_art, :album_art_url, :youtube_link, :spotify_link, :tidal_link, :apple_music_link, :created_at, :mbid, :label, :isrc]
  @type t :: %__MODULE__{title: String.t(), artist: String.t(), artists: [Rocksky.Models.ArtistMbid.t()] | nil, album_artist: String.t(), album: String.t(), duration: integer(), track_number: integer() | nil, disc_number: integer() | nil, release_date: String.t() | nil, year: integer() | nil, genre: String.t() | nil, tags: [String.t()] | nil, composer: String.t() | nil, lyrics: String.t() | nil, copyright_message: String.t() | nil, wiki: String.t() | nil, album_art: Rocksky.Models.BlobRef.t() | nil, album_art_url: String.t() | nil, youtube_link: String.t() | nil, spotify_link: String.t() | nil, tidal_link: String.t() | nil, apple_music_link: String.t() | nil, created_at: String.t(), mbid: String.t() | nil, label: String.t() | nil, isrc: String.t() | nil}
  def __schema__, do: [{"title", :title, true, false, :string}, {"artist", :artist, true, false, :string}, {"artists", :artists, false, false, {:list, {:record, Rocksky.Models.ArtistMbid}}}, {"albumArtist", :album_artist, true, false, :string}, {"album", :album, true, false, :string}, {"duration", :duration, true, false, :integer}, {"trackNumber", :track_number, false, false, :integer}, {"discNumber", :disc_number, false, false, :integer}, {"releaseDate", :release_date, false, false, :string}, {"year", :year, false, false, :integer}, {"genre", :genre, false, false, :string}, {"tags", :tags, false, false, {:list, :string}}, {"composer", :composer, false, false, :string}, {"lyrics", :lyrics, false, false, :string}, {"copyrightMessage", :copyright_message, false, false, :string}, {"wiki", :wiki, false, false, :string}, {"albumArt", :album_art, false, false, {:record, Rocksky.Models.BlobRef}}, {"albumArtUrl", :album_art_url, false, false, :string}, {"youtubeLink", :youtube_link, false, false, :string}, {"spotifyLink", :spotify_link, false, false, :string}, {"tidalLink", :tidal_link, false, false, :string}, {"appleMusicLink", :apple_music_link, false, false, :string}, {"createdAt", :created_at, true, false, :string}, {"mbid", :mbid, false, false, :string}, {"label", :label, false, false, :string}, {"isrc", :isrc, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.SongResponseMbArtistsItemView do
  @enforce_keys []
  defstruct [:mbid, :name]
  @type t :: %__MODULE__{mbid: String.t() | nil, name: String.t() | nil}
  def __schema__, do: [{"mbid", :mbid, false, false, :string}, {"name", :name, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.SongViewBasic do
  @enforce_keys []
  defstruct [:id, :title, :artist, :album_artist, :album_art, :uri, :album, :duration, :track_number, :disc_number, :play_count, :likes_count, :liked, :unique_listeners, :album_uri, :artist_uri, :sha256, :mbid, :isrc, :tags, :created_at, :updated_at, :mb_id, :youtube_link, :spotify_link, :apple_music_link, :tidal_link, :lyrics, :composer, :genre, :label, :copyright_message, :key, :acoustid_fingerprint, :xata_version, :bpm]
  @type t :: %__MODULE__{id: String.t() | nil, title: String.t() | nil, artist: String.t() | nil, album_artist: String.t() | nil, album_art: String.t() | nil, uri: String.t() | nil, album: String.t() | nil, duration: integer() | nil, track_number: integer() | nil, disc_number: integer() | nil, play_count: integer() | nil, likes_count: integer() | nil, liked: boolean() | nil, unique_listeners: integer() | nil, album_uri: String.t() | nil, artist_uri: String.t() | nil, sha256: String.t() | nil, mbid: String.t() | nil, isrc: String.t() | nil, tags: [String.t()] | nil, created_at: String.t() | nil, updated_at: String.t() | nil, mb_id: String.t() | nil, youtube_link: String.t() | nil, spotify_link: String.t() | nil, apple_music_link: String.t() | nil, tidal_link: String.t() | nil, lyrics: String.t() | nil, composer: String.t() | nil, genre: String.t() | nil, label: String.t() | nil, copyright_message: String.t() | nil, key: String.t() | nil, acoustid_fingerprint: String.t() | nil, xata_version: integer() | nil, bpm: float() | nil}
  def __schema__, do: [{"id", :id, false, false, :string}, {"title", :title, false, false, :string}, {"artist", :artist, false, false, :string}, {"albumArtist", :album_artist, false, false, :string}, {"albumArt", :album_art, false, true, :string}, {"uri", :uri, false, true, :string}, {"album", :album, false, false, :string}, {"duration", :duration, false, false, :integer}, {"trackNumber", :track_number, false, true, :integer}, {"discNumber", :disc_number, false, true, :integer}, {"playCount", :play_count, false, false, :integer}, {"likesCount", :likes_count, false, false, :integer}, {"liked", :liked, false, false, :boolean}, {"uniqueListeners", :unique_listeners, false, false, :integer}, {"albumUri", :album_uri, false, true, :string}, {"artistUri", :artist_uri, false, true, :string}, {"sha256", :sha256, false, false, :string}, {"mbid", :mbid, false, false, :string}, {"isrc", :isrc, false, true, :string}, {"tags", :tags, false, false, {:list, :string}}, {"createdAt", :created_at, false, false, :string}, {"updatedAt", :updated_at, false, false, :string}, {"mbId", :mb_id, false, true, :string}, {"youtubeLink", :youtube_link, false, true, :string}, {"spotifyLink", :spotify_link, false, true, :string}, {"appleMusicLink", :apple_music_link, false, true, :string}, {"tidalLink", :tidal_link, false, true, :string}, {"lyrics", :lyrics, false, true, :string}, {"composer", :composer, false, true, :string}, {"genre", :genre, false, true, :string}, {"label", :label, false, true, :string}, {"copyrightMessage", :copyright_message, false, true, :string}, {"key", :key, false, true, :string}, {"acoustidFingerprint", :acoustid_fingerprint, false, true, :string}, {"xataVersion", :xata_version, false, true, :integer}, {"bpm", :bpm, false, false, :float}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.SongViewDetailed do
  @enforce_keys []
  defstruct [:id, :title, :artist, :album_artist, :album_art, :uri, :album, :duration, :track_number, :disc_number, :play_count, :likes_count, :liked, :unique_listeners, :album_uri, :artist_uri, :sha256, :mbid, :isrc, :tags, :created_at, :artists, :first_scrobble, :matches, :mb_id, :updated_at, :release_date, :year, :artist_picture, :genres, :mb_artists, :youtube_link, :spotify_link, :apple_music_link, :tidal_link, :lyrics, :composer, :genre, :label, :copyright_message, :key, :acoustid_fingerprint, :xata_version, :bpm]
  @type t :: %__MODULE__{id: String.t() | nil, title: String.t() | nil, artist: String.t() | nil, album_artist: String.t() | nil, album_art: String.t() | nil, uri: String.t() | nil, album: String.t() | nil, duration: integer() | nil, track_number: integer() | nil, disc_number: integer() | nil, play_count: integer() | nil, likes_count: integer() | nil, liked: boolean() | nil, unique_listeners: integer() | nil, album_uri: String.t() | nil, artist_uri: String.t() | nil, sha256: String.t() | nil, mbid: String.t() | nil, isrc: String.t() | nil, tags: [String.t()] | nil, created_at: String.t() | nil, artists: [Rocksky.Models.ArtistViewBasic.t()] | nil, first_scrobble: Rocksky.Models.SongFirstScrobbleView.t() | nil, matches: [Rocksky.Models.SongMatchView.t()] | nil, mb_id: String.t() | nil, updated_at: String.t() | nil, release_date: String.t() | nil, year: integer() | nil, artist_picture: String.t() | nil, genres: [String.t()] | nil, mb_artists: [Rocksky.Models.SongResponseMbArtistsItemView.t()] | nil, youtube_link: String.t() | nil, spotify_link: String.t() | nil, apple_music_link: String.t() | nil, tidal_link: String.t() | nil, lyrics: String.t() | nil, composer: String.t() | nil, genre: String.t() | nil, label: String.t() | nil, copyright_message: String.t() | nil, key: String.t() | nil, acoustid_fingerprint: String.t() | nil, xata_version: integer() | nil, bpm: float() | nil}
  def __schema__, do: [{"id", :id, false, false, :string}, {"title", :title, false, false, :string}, {"artist", :artist, false, false, :string}, {"albumArtist", :album_artist, false, false, :string}, {"albumArt", :album_art, false, true, :string}, {"uri", :uri, false, true, :string}, {"album", :album, false, false, :string}, {"duration", :duration, false, false, :integer}, {"trackNumber", :track_number, false, true, :integer}, {"discNumber", :disc_number, false, true, :integer}, {"playCount", :play_count, false, false, :integer}, {"likesCount", :likes_count, false, false, :integer}, {"liked", :liked, false, false, :boolean}, {"uniqueListeners", :unique_listeners, false, false, :integer}, {"albumUri", :album_uri, false, true, :string}, {"artistUri", :artist_uri, false, true, :string}, {"sha256", :sha256, false, false, :string}, {"mbid", :mbid, false, false, :string}, {"isrc", :isrc, false, true, :string}, {"tags", :tags, false, false, {:list, :string}}, {"createdAt", :created_at, false, false, :string}, {"artists", :artists, false, false, {:list, {:record, Rocksky.Models.ArtistViewBasic}}}, {"firstScrobble", :first_scrobble, false, false, {:record, Rocksky.Models.SongFirstScrobbleView}}, {"matches", :matches, false, false, {:list, {:record, Rocksky.Models.SongMatchView}}}, {"mbId", :mb_id, false, true, :string}, {"updatedAt", :updated_at, false, false, :string}, {"releaseDate", :release_date, false, true, :string}, {"year", :year, false, true, :integer}, {"artistPicture", :artist_picture, false, true, :string}, {"genres", :genres, false, true, {:list, :string}}, {"mbArtists", :mb_artists, false, true, {:list, {:record, Rocksky.Models.SongResponseMbArtistsItemView}}}, {"youtubeLink", :youtube_link, false, true, :string}, {"spotifyLink", :spotify_link, false, true, :string}, {"appleMusicLink", :apple_music_link, false, true, :string}, {"tidalLink", :tidal_link, false, true, :string}, {"lyrics", :lyrics, false, true, :string}, {"composer", :composer, false, true, :string}, {"genre", :genre, false, true, :string}, {"label", :label, false, true, :string}, {"copyrightMessage", :copyright_message, false, true, :string}, {"key", :key, false, true, :string}, {"acoustidFingerprint", :acoustid_fingerprint, false, true, :string}, {"xataVersion", :xata_version, false, true, :integer}, {"bpm", :bpm, false, false, :float}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.SpotifyGetCurrentlyPlayingParams do
  @enforce_keys []
  defstruct [:actor]
  @type t :: %__MODULE__{actor: String.t() | nil}
  def __schema__, do: [{"actor", :actor, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.SpotifySeekParams do
  @enforce_keys [:position]
  defstruct [:position]
  @type t :: %__MODULE__{position: integer()}
  def __schema__, do: [{"position", :position, true, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.SpotifyTrackView do
  @enforce_keys []
  defstruct [:id, :name, :artist, :album, :duration, :preview_url]
  @type t :: %__MODULE__{id: String.t() | nil, name: String.t() | nil, artist: String.t() | nil, album: String.t() | nil, duration: integer() | nil, preview_url: String.t() | nil}
  def __schema__, do: [{"id", :id, false, false, :string}, {"name", :name, false, false, :string}, {"artist", :artist, false, false, :string}, {"album", :album, false, false, :string}, {"duration", :duration, false, false, :integer}, {"previewUrl", :preview_url, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.StarInput do
  @enforce_keys [:id]
  defstruct [:id, :album_id, :artist_id]
  @type t :: %__MODULE__{id: String.t(), album_id: String.t() | nil, artist_id: String.t() | nil}
  def __schema__, do: [{"id", :id, true, false, :string}, {"albumId", :album_id, false, false, :string}, {"artistId", :artist_id, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.StarOutput do
  @enforce_keys []
  defstruct [:status, :version, :type, :server_version, :open_subsonic]
  @type t :: %__MODULE__{status: String.t() | nil, version: String.t() | nil, type: String.t() | nil, server_version: String.t() | nil, open_subsonic: boolean() | nil}
  def __schema__, do: [{"status", :status, false, false, :string}, {"version", :version, false, false, :string}, {"type", :type, false, false, :string}, {"serverVersion", :server_version, false, false, :string}, {"openSubsonic", :open_subsonic, false, false, :boolean}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.StartPlaylistParams do
  @enforce_keys [:uri]
  defstruct [:uri, :shuffle, :position]
  @type t :: %__MODULE__{uri: String.t(), shuffle: boolean() | nil, position: integer() | nil}
  def __schema__, do: [{"uri", :uri, true, false, :string}, {"shuffle", :shuffle, false, false, :boolean}, {"position", :position, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.StartScanOutput do
  @enforce_keys []
  defstruct [:status, :version, :type, :server_version, :open_subsonic, :scan_status]
  @type t :: %__MODULE__{status: String.t() | nil, version: String.t() | nil, type: String.t() | nil, server_version: String.t() | nil, open_subsonic: boolean() | nil, scan_status: Rocksky.Codec.json_value() | nil}
  def __schema__, do: [{"status", :status, false, false, :string}, {"version", :version, false, false, :string}, {"type", :type, false, false, :string}, {"serverVersion", :server_version, false, false, :string}, {"openSubsonic", :open_subsonic, false, false, :boolean}, {"scanStatus", :scan_status, false, false, :json_value}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.StartScanParams do
  @enforce_keys []
  defstruct []
  @type t :: %__MODULE__{}
  def __schema__, do: []
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.StatsGlobalStatsView do
  @enforce_keys []
  defstruct [:scrobbles, :users, :artists, :albums, :tracks]
  @type t :: %__MODULE__{scrobbles: integer() | nil, users: integer() | nil, artists: integer() | nil, albums: integer() | nil, tracks: integer() | nil}
  def __schema__, do: [{"scrobbles", :scrobbles, false, false, :integer}, {"users", :users, false, false, :integer}, {"artists", :artists, false, false, :integer}, {"albums", :albums, false, false, :integer}, {"tracks", :tracks, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.StatsView do
  @enforce_keys []
  defstruct [:scrobbles, :artists, :loved_tracks, :albums, :tracks]
  @type t :: %__MODULE__{scrobbles: integer() | nil, artists: integer() | nil, loved_tracks: integer() | nil, albums: integer() | nil, tracks: integer() | nil}
  def __schema__, do: [{"scrobbles", :scrobbles, false, false, :integer}, {"artists", :artists, false, false, :integer}, {"lovedTracks", :loved_tracks, false, false, :integer}, {"albums", :albums, false, false, :integer}, {"tracks", :tracks, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.StatsWrappedAlbum do
  @enforce_keys []
  defstruct [:id, :title, :artist, :album_art, :uri, :play_count]
  @type t :: %__MODULE__{id: String.t() | nil, title: String.t() | nil, artist: String.t() | nil, album_art: String.t() | nil, uri: String.t() | nil, play_count: integer() | nil}
  def __schema__, do: [{"id", :id, false, false, :string}, {"title", :title, false, false, :string}, {"artist", :artist, false, false, :string}, {"albumArt", :album_art, false, false, :string}, {"uri", :uri, false, false, :string}, {"playCount", :play_count, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.StatsWrappedArtist do
  @enforce_keys []
  defstruct [:id, :name, :picture, :uri, :play_count]
  @type t :: %__MODULE__{id: String.t() | nil, name: String.t() | nil, picture: String.t() | nil, uri: String.t() | nil, play_count: integer() | nil}
  def __schema__, do: [{"id", :id, false, false, :string}, {"name", :name, false, false, :string}, {"picture", :picture, false, false, :string}, {"uri", :uri, false, false, :string}, {"playCount", :play_count, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.StatsWrappedDayCount do
  @enforce_keys []
  defstruct [:date, :count]
  @type t :: %__MODULE__{date: String.t() | nil, count: integer() | nil}
  def __schema__, do: [{"date", :date, false, false, :string}, {"count", :count, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.StatsWrappedGenreCount do
  @enforce_keys []
  defstruct [:genre, :count]
  @type t :: %__MODULE__{genre: String.t() | nil, count: integer() | nil}
  def __schema__, do: [{"genre", :genre, false, false, :string}, {"count", :count, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.StatsWrappedMilestone do
  @enforce_keys []
  defstruct [:track_title, :artist_name, :timestamp, :track_uri]
  @type t :: %__MODULE__{track_title: String.t() | nil, artist_name: String.t() | nil, timestamp: String.t() | nil, track_uri: String.t() | nil}
  def __schema__, do: [{"trackTitle", :track_title, false, false, :string}, {"artistName", :artist_name, false, false, :string}, {"timestamp", :timestamp, false, false, :string}, {"trackUri", :track_uri, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.StatsWrappedMonthCount do
  @enforce_keys []
  defstruct [:month, :count]
  @type t :: %__MODULE__{month: integer() | nil, count: integer() | nil}
  def __schema__, do: [{"month", :month, false, false, :integer}, {"count", :count, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.StatsWrappedTrack do
  @enforce_keys []
  defstruct [:id, :title, :artist, :album_art, :uri, :artist_uri, :album_uri, :play_count]
  @type t :: %__MODULE__{id: String.t() | nil, title: String.t() | nil, artist: String.t() | nil, album_art: String.t() | nil, uri: String.t() | nil, artist_uri: String.t() | nil, album_uri: String.t() | nil, play_count: integer() | nil}
  def __schema__, do: [{"id", :id, false, false, :string}, {"title", :title, false, false, :string}, {"artist", :artist, false, false, :string}, {"albumArt", :album_art, false, false, :string}, {"uri", :uri, false, false, :string}, {"artistUri", :artist_uri, false, false, :string}, {"albumUri", :album_uri, false, false, :string}, {"playCount", :play_count, false, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.StatsWrappedView do
  @enforce_keys []
  defstruct [:year, :period, :start_date, :end_date, :total_scrobbles, :total_listening_time_minutes, :top_artists, :top_tracks, :top_albums, :top_genres, :scrobbles_per_month, :scrobbles_per_day, :most_active_day, :most_active_hour, :new_artists_count, :longest_streak, :first_scrobble, :last_scrobble]
  @type t :: %__MODULE__{year: integer() | nil, period: String.t() | nil, start_date: String.t() | nil, end_date: String.t() | nil, total_scrobbles: integer() | nil, total_listening_time_minutes: integer() | nil, top_artists: [Rocksky.Models.StatsWrappedArtist.t()] | nil, top_tracks: [Rocksky.Models.StatsWrappedTrack.t()] | nil, top_albums: [Rocksky.Models.StatsWrappedAlbum.t()] | nil, top_genres: [Rocksky.Models.StatsWrappedGenreCount.t()] | nil, scrobbles_per_month: [Rocksky.Models.StatsWrappedMonthCount.t()] | nil, scrobbles_per_day: [Rocksky.Models.StatsWrappedDayCount.t()] | nil, most_active_day: Rocksky.Models.StatsWrappedDayCount.t() | nil, most_active_hour: integer() | nil, new_artists_count: integer() | nil, longest_streak: integer() | nil, first_scrobble: Rocksky.Models.StatsWrappedMilestone.t() | nil, last_scrobble: Rocksky.Models.StatsWrappedMilestone.t() | nil}
  def __schema__, do: [{"year", :year, false, false, :integer}, {"period", :period, false, false, :string}, {"startDate", :start_date, false, false, :string}, {"endDate", :end_date, false, false, :string}, {"totalScrobbles", :total_scrobbles, false, false, :integer}, {"totalListeningTimeMinutes", :total_listening_time_minutes, false, false, :integer}, {"topArtists", :top_artists, false, false, {:list, {:record, Rocksky.Models.StatsWrappedArtist}}}, {"topTracks", :top_tracks, false, false, {:list, {:record, Rocksky.Models.StatsWrappedTrack}}}, {"topAlbums", :top_albums, false, false, {:list, {:record, Rocksky.Models.StatsWrappedAlbum}}}, {"topGenres", :top_genres, false, false, {:list, {:record, Rocksky.Models.StatsWrappedGenreCount}}}, {"scrobblesPerMonth", :scrobbles_per_month, false, false, {:list, {:record, Rocksky.Models.StatsWrappedMonthCount}}}, {"scrobblesPerDay", :scrobbles_per_day, false, false, {:list, {:record, Rocksky.Models.StatsWrappedDayCount}}}, {"mostActiveDay", :most_active_day, false, false, {:record, Rocksky.Models.StatsWrappedDayCount}}, {"mostActiveHour", :most_active_hour, false, false, :integer}, {"newArtistsCount", :new_artists_count, false, false, :integer}, {"longestStreak", :longest_streak, false, false, :integer}, {"firstScrobble", :first_scrobble, false, false, {:record, Rocksky.Models.StatsWrappedMilestone}}, {"lastScrobble", :last_scrobble, false, false, {:record, Rocksky.Models.StatsWrappedMilestone}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.StatusRecord do
  @enforce_keys [:track, :started_at]
  defstruct [:track, :started_at, :expires_at]
  @type t :: %__MODULE__{track: Rocksky.Models.ActorTrackView.t(), started_at: String.t(), expires_at: String.t() | nil}
  def __schema__, do: [{"track", :track, true, false, {:record, Rocksky.Models.ActorTrackView}}, {"startedAt", :started_at, true, false, :string}, {"expiresAt", :expires_at, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.StrongRef do
  @enforce_keys [:uri, :cid]
  defstruct [:uri, :cid]
  @type t :: %__MODULE__{uri: String.t(), cid: String.t()}
  def __schema__, do: [{"uri", :uri, true, false, :string}, {"cid", :cid, true, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.UnfollowAccountOutput do
  @enforce_keys [:subject, :followers]
  defstruct [:subject, :followers, :cursor]
  @type t :: %__MODULE__{subject: Rocksky.Models.ActorProfileViewBasic.t(), followers: [Rocksky.Models.ActorProfileViewBasic.t()], cursor: String.t() | nil}
  def __schema__, do: [{"subject", :subject, true, false, {:record, Rocksky.Models.ActorProfileViewBasic}}, {"followers", :followers, true, false, {:list, {:record, Rocksky.Models.ActorProfileViewBasic}}}, {"cursor", :cursor, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.UnfollowAccountParams do
  @enforce_keys [:account]
  defstruct [:account]
  @type t :: %__MODULE__{account: String.t()}
  def __schema__, do: [{"account", :account, true, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.UnstarInput do
  @enforce_keys [:id]
  defstruct [:id, :album_id, :artist_id]
  @type t :: %__MODULE__{id: String.t(), album_id: String.t() | nil, artist_id: String.t() | nil}
  def __schema__, do: [{"id", :id, true, false, :string}, {"albumId", :album_id, false, false, :string}, {"artistId", :artist_id, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.UnstarOutput do
  @enforce_keys []
  defstruct [:status, :version, :type, :server_version, :open_subsonic]
  @type t :: %__MODULE__{status: String.t() | nil, version: String.t() | nil, type: String.t() | nil, server_version: String.t() | nil, open_subsonic: boolean() | nil}
  def __schema__, do: [{"status", :status, false, false, :string}, {"version", :version, false, false, :string}, {"type", :type, false, false, :string}, {"serverVersion", :server_version, false, false, :string}, {"openSubsonic", :open_subsonic, false, false, :boolean}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.UpdateApikeyInput do
  @enforce_keys [:id, :name]
  defstruct [:id, :name, :description]
  @type t :: %__MODULE__{id: String.t(), name: String.t(), description: String.t() | nil}
  def __schema__, do: [{"id", :id, true, false, :string}, {"name", :name, true, false, :string}, {"description", :description, false, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.UpdateNowPlayingInput do
  @enforce_keys [:id]
  defstruct [:id]
  @type t :: %__MODULE__{id: String.t()}
  def __schema__, do: [{"id", :id, true, false, :string}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.UpdateNowPlayingOutput do
  @enforce_keys []
  defstruct [:status, :version, :type, :server_version, :open_subsonic]
  @type t :: %__MODULE__{status: String.t() | nil, version: String.t() | nil, type: String.t() | nil, server_version: String.t() | nil, open_subsonic: boolean() | nil}
  def __schema__, do: [{"status", :status, false, false, :string}, {"version", :version, false, false, :string}, {"type", :type, false, false, :string}, {"serverVersion", :server_version, false, false, :string}, {"openSubsonic", :open_subsonic, false, false, :boolean}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.UpdateSeenInput do
  @enforce_keys []
  defstruct [:ids]
  @type t :: %__MODULE__{ids: [String.t()] | nil}
  def __schema__, do: [{"ids", :ids, false, false, {:list, :string}}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end

defmodule Rocksky.Models.UpdateSeenOutput do
  @enforce_keys [:unread_count]
  defstruct [:unread_count]
  @type t :: %__MODULE__{unread_count: integer()}
  def __schema__, do: [{"unreadCount", :unread_count, true, false, :integer}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end
