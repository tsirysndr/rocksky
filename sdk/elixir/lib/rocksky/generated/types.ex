# AUTO-GENERATED FILE -- DO NOT EDIT.
# Source: apps/api/lexicons/**/*.json
# Regenerate via: bun run lexgen:types

defmodule Rocksky.Generated.BlobRef do
  @moduledoc "atproto blob reference shape."
  @type t :: %__MODULE__{
          type: String.t() | nil,
          ref: map() | nil,
          mimeType: String.t() | nil,
          size: integer() | nil
        }
  defstruct [:type, :ref, :mimeType, :size]
end


defmodule Rocksky.Generated.ActorArtistViewBasic do
  @moduledoc false
  @type t :: %__MODULE__{
          id: String.t() | nil,
          name: String.t() | nil,
          picture: String.t() | nil,
          uri: String.t() | nil,
          user1Rank: integer() | nil,
          user2Rank: integer() | nil,
          weight: integer() | nil
        }
  defstruct [:id, :name, :picture, :uri, :user1Rank, :user2Rank, :weight]
end

defmodule Rocksky.Generated.ActorCompatibilityViewBasic do
  @moduledoc false
  @type t :: %__MODULE__{
          compatibilityLevel: integer() | nil,
          compatibilityPercentage: integer() | nil,
          sharedArtists: integer() | nil,
          topSharedArtistNames: list(String.t()) | nil,
          topSharedDetailedArtists: list(Rocksky.Generated.ActorArtistViewBasic.t()) | nil,
          user1ArtistCount: integer() | nil,
          user2ArtistCount: integer() | nil
        }
  defstruct [:compatibilityLevel, :compatibilityPercentage, :sharedArtists, :topSharedArtistNames, :topSharedDetailedArtists, :user1ArtistCount, :user2ArtistCount]
end

defmodule Rocksky.Generated.ActorNeighbourViewBasic do
  @moduledoc false
  @type t :: %__MODULE__{
          userId: String.t() | nil,
          did: String.t() | nil,
          handle: String.t() | nil,
          displayName: String.t() | nil,
          avatar: String.t() | nil,
          sharedArtistsCount: integer() | nil,
          similarityScore: integer() | nil,
          topSharedArtistNames: list(String.t()) | nil,
          topSharedArtistsDetails: list(Rocksky.Generated.ArtistViewBasic.t()) | nil
        }
  defstruct [:userId, :did, :handle, :displayName, :avatar, :sharedArtistsCount, :similarityScore, :topSharedArtistNames, :topSharedArtistsDetails]
end

defmodule Rocksky.Generated.ActorProfileViewBasic do
  @moduledoc false
  @type t :: %__MODULE__{
          id: String.t() | nil,
          did: String.t() | nil,
          handle: String.t() | nil,
          displayName: String.t() | nil,
          avatar: String.t() | nil,
          createdAt: String.t() | nil,
          updatedAt: String.t() | nil
        }
  defstruct [:id, :did, :handle, :displayName, :avatar, :createdAt, :updatedAt]
end

defmodule Rocksky.Generated.ActorProfileViewDetailed do
  @moduledoc false
  @type t :: %__MODULE__{
          id: String.t() | nil,
          did: String.t() | nil,
          handle: String.t() | nil,
          displayName: String.t() | nil,
          avatar: String.t() | nil,
          createdAt: String.t() | nil,
          updatedAt: String.t() | nil
        }
  defstruct [:id, :did, :handle, :displayName, :avatar, :createdAt, :updatedAt]
end

defmodule Rocksky.Generated.ActorTrackView do
  @moduledoc false
  @type t :: %__MODULE__{
          name: String.t(),
          artist: String.t(),
          album: String.t() | nil,
          albumCoverUrl: String.t() | nil,
          durationMs: integer() | nil,
          source: String.t() | nil,
          recordingMbId: String.t() | nil
        }
  @enforce_keys [:name, :artist]
  defstruct [:name, :artist, :album, :albumCoverUrl, :durationMs, :source, :recordingMbId]
end

defmodule Rocksky.Generated.AddDirectoryToQueueParams do
  @moduledoc false
  @type t :: %__MODULE__{
          playerId: String.t() | nil,
          directory: String.t(),
          position: integer() | nil,
          shuffle: boolean() | nil
        }
  @enforce_keys [:directory]
  defstruct [:playerId, :directory, :position, :shuffle]
end

defmodule Rocksky.Generated.AddItemsToQueueParams do
  @moduledoc false
  @type t :: %__MODULE__{
          playerId: String.t() | nil,
          items: list(String.t()),
          position: integer() | nil,
          shuffle: boolean() | nil
        }
  @enforce_keys [:items]
  defstruct [:playerId, :items, :position, :shuffle]
end

defmodule Rocksky.Generated.AlbumRecord do
  @moduledoc false
  @type t :: %__MODULE__{
          title: String.t(),
          artist: String.t(),
          duration: integer() | nil,
          releaseDate: String.t() | nil,
          year: integer() | nil,
          genre: String.t() | nil,
          albumArt: Rocksky.Generated.BlobRef.t() | nil,
          albumArtUrl: String.t() | nil,
          tags: list(String.t()) | nil,
          youtubeLink: String.t() | nil,
          spotifyLink: String.t() | nil,
          tidalLink: String.t() | nil,
          appleMusicLink: String.t() | nil,
          createdAt: String.t()
        }
  @enforce_keys [:title, :artist, :createdAt]
  defstruct [:title, :artist, :duration, :releaseDate, :year, :genre, :albumArt, :albumArtUrl, :tags, :youtubeLink, :spotifyLink, :tidalLink, :appleMusicLink, :createdAt]
end

defmodule Rocksky.Generated.AlbumViewBasic do
  @moduledoc false
  @type t :: %__MODULE__{
          id: String.t() | nil,
          uri: String.t() | nil,
          title: String.t() | nil,
          artist: String.t() | nil,
          artistUri: String.t() | nil,
          year: integer() | nil,
          albumArt: String.t() | nil,
          releaseDate: String.t() | nil,
          sha256: String.t() | nil,
          playCount: integer() | nil,
          uniqueListeners: integer() | nil
        }
  defstruct [:id, :uri, :title, :artist, :artistUri, :year, :albumArt, :releaseDate, :sha256, :playCount, :uniqueListeners]
end

defmodule Rocksky.Generated.AlbumViewDetailed do
  @moduledoc false
  @type t :: %__MODULE__{
          id: String.t() | nil,
          uri: String.t() | nil,
          title: String.t() | nil,
          artist: String.t() | nil,
          artistUri: String.t() | nil,
          year: integer() | nil,
          albumArt: String.t() | nil,
          releaseDate: String.t() | nil,
          sha256: String.t() | nil,
          playCount: integer() | nil,
          uniqueListeners: integer() | nil,
          tags: list(String.t()) | nil,
          tracks: list(Rocksky.Generated.SongViewBasic.t()) | nil
        }
  defstruct [:id, :uri, :title, :artist, :artistUri, :year, :albumArt, :releaseDate, :sha256, :playCount, :uniqueListeners, :tags, :tracks]
end

defmodule Rocksky.Generated.ApiKeyView do
  @moduledoc false
  @type t :: %__MODULE__{
          id: String.t() | nil,
          name: String.t() | nil,
          description: String.t() | nil,
          createdAt: String.t() | nil
        }
  defstruct [:id, :name, :description, :createdAt]
end

defmodule Rocksky.Generated.ArtistListenerViewBasic do
  @moduledoc false
  @type t :: %__MODULE__{
          id: String.t() | nil,
          did: String.t() | nil,
          handle: String.t() | nil,
          displayName: String.t() | nil,
          avatar: String.t() | nil,
          mostListenedSong: Rocksky.Generated.ArtistSongViewBasic.t() | nil,
          totalPlays: integer() | nil,
          rank: integer() | nil
        }
  defstruct [:id, :did, :handle, :displayName, :avatar, :mostListenedSong, :totalPlays, :rank]
end

defmodule Rocksky.Generated.ArtistMbid do
  @moduledoc false
  @type t :: %__MODULE__{
          mbid: String.t() | nil,
          name: String.t() | nil
        }
  defstruct [:mbid, :name]
end

defmodule Rocksky.Generated.ArtistRecentListenerView do
  @moduledoc false
  @type t :: %__MODULE__{
          id: String.t() | nil,
          did: String.t() | nil,
          handle: String.t() | nil,
          displayName: String.t() | nil,
          avatar: String.t() | nil,
          timestamp: String.t() | nil,
          scrobbleUri: String.t() | nil
        }
  defstruct [:id, :did, :handle, :displayName, :avatar, :timestamp, :scrobbleUri]
end

defmodule Rocksky.Generated.ArtistRecord do
  @moduledoc false
  @type t :: %__MODULE__{
          name: String.t(),
          bio: String.t() | nil,
          picture: Rocksky.Generated.BlobRef.t() | nil,
          pictureUrl: String.t() | nil,
          tags: list(String.t()) | nil,
          born: String.t() | nil,
          died: String.t() | nil,
          bornIn: String.t() | nil,
          createdAt: String.t()
        }
  @enforce_keys [:name, :createdAt]
  defstruct [:name, :bio, :picture, :pictureUrl, :tags, :born, :died, :bornIn, :createdAt]
end

defmodule Rocksky.Generated.ArtistSongViewBasic do
  @moduledoc false
  @type t :: %__MODULE__{
          uri: String.t() | nil,
          title: String.t() | nil,
          playCount: integer() | nil
        }
  defstruct [:uri, :title, :playCount]
end

defmodule Rocksky.Generated.ArtistViewBasic do
  @moduledoc false
  @type t :: %__MODULE__{
          id: String.t() | nil,
          uri: String.t() | nil,
          name: String.t() | nil,
          picture: String.t() | nil,
          sha256: String.t() | nil,
          playCount: integer() | nil,
          uniqueListeners: integer() | nil,
          tags: list(String.t()) | nil
        }
  defstruct [:id, :uri, :name, :picture, :sha256, :playCount, :uniqueListeners, :tags]
end

defmodule Rocksky.Generated.ArtistViewDetailed do
  @moduledoc false
  @type t :: %__MODULE__{
          id: String.t() | nil,
          uri: String.t() | nil,
          name: String.t() | nil,
          picture: String.t() | nil,
          sha256: String.t() | nil,
          playCount: integer() | nil,
          uniqueListeners: integer() | nil,
          tags: list(String.t()) | nil
        }
  defstruct [:id, :uri, :name, :picture, :sha256, :playCount, :uniqueListeners, :tags]
end

defmodule Rocksky.Generated.ChartsScrobbleViewBasic do
  @moduledoc false
  @type t :: %__MODULE__{
          date: String.t() | nil,
          count: integer() | nil
        }
  defstruct [:date, :count]
end

defmodule Rocksky.Generated.ChartsView do
  @moduledoc false
  @type t :: %__MODULE__{
          scrobbles: list(Rocksky.Generated.ChartsScrobbleViewBasic.t()) | nil
        }
  defstruct [:scrobbles]
end

defmodule Rocksky.Generated.CreateApikeyInput do
  @moduledoc false
  @type t :: %__MODULE__{
          name: String.t(),
          description: String.t() | nil
        }
  @enforce_keys [:name]
  defstruct [:name, :description]
end

defmodule Rocksky.Generated.CreatePlaylistParams do
  @moduledoc false
  @type t :: %__MODULE__{
          name: String.t(),
          description: String.t() | nil
        }
  @enforce_keys [:name]
  defstruct [:name, :description]
end

defmodule Rocksky.Generated.CreateScrobbleInput do
  @moduledoc false
  @type t :: %__MODULE__{
          title: String.t(),
          artist: String.t(),
          album: String.t() | nil,
          duration: integer() | nil,
          mbId: String.t() | nil,
          isrc: String.t() | nil,
          albumArt: String.t() | nil,
          trackNumber: integer() | nil,
          releaseDate: String.t() | nil,
          year: integer() | nil,
          discNumber: integer() | nil,
          lyrics: String.t() | nil,
          composer: String.t() | nil,
          copyrightMessage: String.t() | nil,
          label: String.t() | nil,
          artistPicture: String.t() | nil,
          spotifyLink: String.t() | nil,
          lastfmLink: String.t() | nil,
          tidalLink: String.t() | nil,
          appleMusicLink: String.t() | nil,
          youtubeLink: String.t() | nil,
          deezerLink: String.t() | nil,
          timestamp: integer() | nil
        }
  @enforce_keys [:title, :artist]
  defstruct [:title, :artist, :album, :duration, :mbId, :isrc, :albumArt, :trackNumber, :releaseDate, :year, :discNumber, :lyrics, :composer, :copyrightMessage, :label, :artistPicture, :spotifyLink, :lastfmLink, :tidalLink, :appleMusicLink, :youtubeLink, :deezerLink, :timestamp]
end

defmodule Rocksky.Generated.CreateShoutInput do
  @moduledoc false
  @type t :: %__MODULE__{
          message: String.t() | nil
        }
  defstruct [:message]
end

defmodule Rocksky.Generated.CreateSongInput do
  @moduledoc false
  @type t :: %__MODULE__{
          title: String.t(),
          artist: String.t(),
          albumArtist: String.t(),
          album: String.t(),
          duration: integer() | nil,
          mbId: String.t() | nil,
          isrc: String.t() | nil,
          albumArt: String.t() | nil,
          trackNumber: integer() | nil,
          releaseDate: String.t() | nil,
          year: integer() | nil,
          discNumber: integer() | nil,
          lyrics: String.t() | nil
        }
  @enforce_keys [:title, :artist, :albumArtist, :album]
  defstruct [:title, :artist, :albumArtist, :album, :duration, :mbId, :isrc, :albumArt, :trackNumber, :releaseDate, :year, :discNumber, :lyrics]
end

defmodule Rocksky.Generated.DescribeFeedGeneratorOutput do
  @moduledoc false
  @type t :: %__MODULE__{
          did: String.t() | nil,
          feeds: list(Rocksky.Generated.FeedUriView.t()) | nil
        }
  defstruct [:did, :feeds]
end

defmodule Rocksky.Generated.DescribeFeedGeneratorParams do
  @moduledoc false
  @type t :: %__MODULE__{}
  defstruct []
end

defmodule Rocksky.Generated.DislikeShoutInput do
  @moduledoc false
  @type t :: %__MODULE__{
          uri: String.t() | nil
        }
  defstruct [:uri]
end

defmodule Rocksky.Generated.DislikeSongInput do
  @moduledoc false
  @type t :: %__MODULE__{
          uri: String.t() | nil
        }
  defstruct [:uri]
end

defmodule Rocksky.Generated.DownloadFileParams do
  @moduledoc false
  @type t :: %__MODULE__{
          fileId: String.t()
        }
  @enforce_keys [:fileId]
  defstruct [:fileId]
end

defmodule Rocksky.Generated.DropboxFileListView do
  @moduledoc false
  @type t :: %__MODULE__{
          files: list(Rocksky.Generated.DropboxFileView.t()) | nil
        }
  defstruct [:files]
end

defmodule Rocksky.Generated.DropboxFileView do
  @moduledoc false
  @type t :: %__MODULE__{
          id: String.t() | nil,
          name: String.t() | nil,
          pathLower: String.t() | nil,
          pathDisplay: String.t() | nil,
          clientModified: String.t() | nil,
          serverModified: String.t() | nil
        }
  defstruct [:id, :name, :pathLower, :pathDisplay, :clientModified, :serverModified]
end

defmodule Rocksky.Generated.DropboxTemporaryLinkView do
  @moduledoc false
  @type t :: %__MODULE__{
          link: String.t() | nil
        }
  defstruct [:link]
end

defmodule Rocksky.Generated.FeedGeneratorsView do
  @moduledoc false
  @type t :: %__MODULE__{
          feeds: list(Rocksky.Generated.FeedGeneratorView.t()) | nil
        }
  defstruct [:feeds]
end

defmodule Rocksky.Generated.FeedGeneratorView do
  @moduledoc false
  @type t :: %__MODULE__{
          id: String.t() | nil,
          name: String.t() | nil,
          description: String.t() | nil,
          uri: String.t() | nil,
          avatar: String.t() | nil,
          creator: Rocksky.Generated.ActorProfileViewBasic.t() | nil
        }
  defstruct [:id, :name, :description, :uri, :avatar, :creator]
end

defmodule Rocksky.Generated.FeedItemView do
  @moduledoc false
  @type t :: %__MODULE__{
          scrobble: Rocksky.Generated.ScrobbleViewBasic.t() | nil
        }
  defstruct [:scrobble]
end

defmodule Rocksky.Generated.FeedRecommendationsView do
  @moduledoc false
  @type t :: %__MODULE__{
          recommendations: list(Rocksky.Generated.FeedRecommendationView.t()) | nil,
          cursor: String.t() | nil
        }
  defstruct [:recommendations, :cursor]
end

defmodule Rocksky.Generated.FeedRecommendationView do
  @moduledoc false
  @type t :: %__MODULE__{
          title: String.t() | nil,
          artist: String.t() | nil,
          album: String.t() | nil,
          albumArt: String.t() | nil,
          trackUri: String.t() | nil,
          artistUri: String.t() | nil,
          albumUri: String.t() | nil,
          genres: list(String.t()) | nil,
          recommendationScore: integer() | nil,
          source: String.t() | nil,
          likesCount: integer() | nil
        }
  defstruct [:title, :artist, :album, :albumArt, :trackUri, :artistUri, :albumUri, :genres, :recommendationScore, :source, :likesCount]
end

defmodule Rocksky.Generated.FeedRecommendedAlbumsView do
  @moduledoc false
  @type t :: %__MODULE__{
          albums: list(Rocksky.Generated.FeedRecommendedAlbumView.t()) | nil,
          cursor: String.t() | nil
        }
  defstruct [:albums, :cursor]
end

defmodule Rocksky.Generated.FeedRecommendedAlbumView do
  @moduledoc false
  @type t :: %__MODULE__{
          id: String.t() | nil,
          uri: String.t() | nil,
          title: String.t() | nil,
          artist: String.t() | nil,
          artistUri: String.t() | nil,
          year: integer() | nil,
          albumArt: String.t() | nil,
          recommendationScore: integer() | nil,
          source: String.t() | nil
        }
  defstruct [:id, :uri, :title, :artist, :artistUri, :year, :albumArt, :recommendationScore, :source]
end

defmodule Rocksky.Generated.FeedRecommendedArtistsView do
  @moduledoc false
  @type t :: %__MODULE__{
          artists: list(Rocksky.Generated.FeedRecommendedArtistView.t()) | nil,
          cursor: String.t() | nil
        }
  defstruct [:artists, :cursor]
end

defmodule Rocksky.Generated.FeedRecommendedArtistView do
  @moduledoc false
  @type t :: %__MODULE__{
          id: String.t() | nil,
          uri: String.t() | nil,
          name: String.t() | nil,
          picture: String.t() | nil,
          genres: list(String.t()) | nil,
          recommendationScore: integer() | nil,
          source: String.t() | nil
        }
  defstruct [:id, :uri, :name, :picture, :genres, :recommendationScore, :source]
end

defmodule Rocksky.Generated.FeedSearchResultsView do
  @moduledoc false
  @type t :: %__MODULE__{
          hits: list(term()) | nil,
          processingTimeMs: integer() | nil,
          limit: integer() | nil,
          offset: integer() | nil,
          estimatedTotalHits: integer() | nil
        }
  defstruct [:hits, :processingTimeMs, :limit, :offset, :estimatedTotalHits]
end

defmodule Rocksky.Generated.FeedStoriesView do
  @moduledoc false
  @type t :: %__MODULE__{
          stories: list(Rocksky.Generated.FeedStoryView.t()) | nil
        }
  defstruct [:stories]
end

defmodule Rocksky.Generated.FeedStoryView do
  @moduledoc false
  @type t :: %__MODULE__{
          album: String.t() | nil,
          albumArt: String.t() | nil,
          albumArtist: String.t() | nil,
          albumUri: String.t() | nil,
          artist: String.t() | nil,
          artistUri: String.t() | nil,
          avatar: String.t() | nil,
          createdAt: String.t() | nil,
          did: String.t() | nil,
          handle: String.t() | nil,
          id: String.t() | nil,
          title: String.t() | nil,
          trackId: String.t() | nil,
          trackUri: String.t() | nil,
          uri: String.t() | nil
        }
  defstruct [:album, :albumArt, :albumArtist, :albumUri, :artist, :artistUri, :avatar, :createdAt, :did, :handle, :id, :title, :trackId, :trackUri, :uri]
end

defmodule Rocksky.Generated.FeedUriView do
  @moduledoc false
  @type t :: %__MODULE__{
          uri: String.t() | nil
        }
  defstruct [:uri]
end

defmodule Rocksky.Generated.FeedView do
  @moduledoc false
  @type t :: %__MODULE__{
          feed: list(Rocksky.Generated.FeedItemView.t()) | nil,
          cursor: String.t() | nil
        }
  defstruct [:feed, :cursor]
end

defmodule Rocksky.Generated.FollowAccountOutput do
  @moduledoc false
  @type t :: %__MODULE__{
          subject: Rocksky.Generated.ActorProfileViewBasic.t(),
          followers: list(Rocksky.Generated.ActorProfileViewBasic.t()),
          cursor: String.t() | nil
        }
  @enforce_keys [:subject, :followers]
  defstruct [:subject, :followers, :cursor]
end

defmodule Rocksky.Generated.FollowAccountParams do
  @moduledoc false
  @type t :: %__MODULE__{
          account: String.t()
        }
  @enforce_keys [:account]
  defstruct [:account]
end

defmodule Rocksky.Generated.FollowRecord do
  @moduledoc false
  @type t :: %__MODULE__{
          createdAt: String.t(),
          subject: String.t(),
          via: Rocksky.Generated.StrongRef.t() | nil
        }
  @enforce_keys [:createdAt, :subject]
  defstruct [:createdAt, :subject, :via]
end

defmodule Rocksky.Generated.GeneratorRecord do
  @moduledoc false
  @type t :: %__MODULE__{
          did: String.t(),
          avatar: Rocksky.Generated.BlobRef.t() | nil,
          displayName: String.t(),
          description: String.t() | nil,
          createdAt: String.t()
        }
  @enforce_keys [:did, :displayName, :createdAt]
  defstruct [:did, :avatar, :displayName, :description, :createdAt]
end

defmodule Rocksky.Generated.GetActorAlbumsOutput do
  @moduledoc false
  @type t :: %__MODULE__{
          albums: list(Rocksky.Generated.AlbumViewBasic.t()) | nil
        }
  defstruct [:albums]
end

defmodule Rocksky.Generated.GetActorAlbumsParams do
  @moduledoc false
  @type t :: %__MODULE__{
          did: String.t(),
          limit: integer() | nil,
          offset: integer() | nil,
          startDate: String.t() | nil,
          endDate: String.t() | nil
        }
  @enforce_keys [:did]
  defstruct [:did, :limit, :offset, :startDate, :endDate]
end

defmodule Rocksky.Generated.GetActorArtistsOutput do
  @moduledoc false
  @type t :: %__MODULE__{
          artists: list(Rocksky.Generated.ArtistViewBasic.t()) | nil
        }
  defstruct [:artists]
end

defmodule Rocksky.Generated.GetActorArtistsParams do
  @moduledoc false
  @type t :: %__MODULE__{
          did: String.t(),
          limit: integer() | nil,
          offset: integer() | nil,
          startDate: String.t() | nil,
          endDate: String.t() | nil
        }
  @enforce_keys [:did]
  defstruct [:did, :limit, :offset, :startDate, :endDate]
end

defmodule Rocksky.Generated.GetActorCompatibilityOutput do
  @moduledoc false
  @type t :: %__MODULE__{
          compatibility: Rocksky.Generated.ActorCompatibilityViewBasic.t() | nil
        }
  defstruct [:compatibility]
end

defmodule Rocksky.Generated.GetActorCompatibilityParams do
  @moduledoc false
  @type t :: %__MODULE__{
          did: String.t()
        }
  @enforce_keys [:did]
  defstruct [:did]
end

defmodule Rocksky.Generated.GetActorLovedSongsOutput do
  @moduledoc false
  @type t :: %__MODULE__{
          tracks: list(Rocksky.Generated.SongViewBasic.t()) | nil
        }
  defstruct [:tracks]
end

defmodule Rocksky.Generated.GetActorLovedSongsParams do
  @moduledoc false
  @type t :: %__MODULE__{
          did: String.t(),
          limit: integer() | nil,
          offset: integer() | nil
        }
  @enforce_keys [:did]
  defstruct [:did, :limit, :offset]
end

defmodule Rocksky.Generated.GetActorNeighboursOutput do
  @moduledoc false
  @type t :: %__MODULE__{
          neighbours: list(Rocksky.Generated.ActorNeighbourViewBasic.t()) | nil
        }
  defstruct [:neighbours]
end

defmodule Rocksky.Generated.GetActorNeighboursParams do
  @moduledoc false
  @type t :: %__MODULE__{
          did: String.t()
        }
  @enforce_keys [:did]
  defstruct [:did]
end

defmodule Rocksky.Generated.GetActorPlaylistsOutput do
  @moduledoc false
  @type t :: %__MODULE__{
          playlists: list(Rocksky.Generated.PlaylistViewBasic.t()) | nil
        }
  defstruct [:playlists]
end

defmodule Rocksky.Generated.GetActorPlaylistsParams do
  @moduledoc false
  @type t :: %__MODULE__{
          did: String.t(),
          limit: integer() | nil,
          offset: integer() | nil
        }
  @enforce_keys [:did]
  defstruct [:did, :limit, :offset]
end

defmodule Rocksky.Generated.GetActorScrobblesOutput do
  @moduledoc false
  @type t :: %__MODULE__{
          scrobbles: list(Rocksky.Generated.ScrobbleViewBasic.t()) | nil
        }
  defstruct [:scrobbles]
end

defmodule Rocksky.Generated.GetActorScrobblesParams do
  @moduledoc false
  @type t :: %__MODULE__{
          did: String.t(),
          limit: integer() | nil,
          offset: integer() | nil
        }
  @enforce_keys [:did]
  defstruct [:did, :limit, :offset]
end

defmodule Rocksky.Generated.GetActorSongsOutput do
  @moduledoc false
  @type t :: %__MODULE__{
          songs: list(Rocksky.Generated.SongViewBasic.t()) | nil
        }
  defstruct [:songs]
end

defmodule Rocksky.Generated.GetActorSongsParams do
  @moduledoc false
  @type t :: %__MODULE__{
          did: String.t(),
          limit: integer() | nil,
          offset: integer() | nil,
          startDate: String.t() | nil,
          endDate: String.t() | nil
        }
  @enforce_keys [:did]
  defstruct [:did, :limit, :offset, :startDate, :endDate]
end

defmodule Rocksky.Generated.GetAlbumParams do
  @moduledoc false
  @type t :: %__MODULE__{
          uri: String.t()
        }
  @enforce_keys [:uri]
  defstruct [:uri]
end

defmodule Rocksky.Generated.GetAlbumRecommendationsParams do
  @moduledoc false
  @type t :: %__MODULE__{
          did: String.t(),
          limit: integer() | nil
        }
  @enforce_keys [:did]
  defstruct [:did, :limit]
end

defmodule Rocksky.Generated.GetAlbumShoutsOutput do
  @moduledoc false
  @type t :: %__MODULE__{
          shouts: list(term()) | nil
        }
  defstruct [:shouts]
end

defmodule Rocksky.Generated.GetAlbumShoutsParams do
  @moduledoc false
  @type t :: %__MODULE__{
          uri: String.t(),
          limit: integer() | nil,
          offset: integer() | nil
        }
  @enforce_keys [:uri]
  defstruct [:uri, :limit, :offset]
end

defmodule Rocksky.Generated.GetAlbumsOutput do
  @moduledoc false
  @type t :: %__MODULE__{
          albums: list(Rocksky.Generated.AlbumViewBasic.t()) | nil
        }
  defstruct [:albums]
end

defmodule Rocksky.Generated.GetAlbumsParams do
  @moduledoc false
  @type t :: %__MODULE__{
          limit: integer() | nil,
          offset: integer() | nil,
          genre: String.t() | nil
        }
  defstruct [:limit, :offset, :genre]
end

defmodule Rocksky.Generated.GetAlbumTracksOutput do
  @moduledoc false
  @type t :: %__MODULE__{
          tracks: list(Rocksky.Generated.SongViewBasic.t()) | nil
        }
  defstruct [:tracks]
end

defmodule Rocksky.Generated.GetAlbumTracksParams do
  @moduledoc false
  @type t :: %__MODULE__{
          uri: String.t()
        }
  @enforce_keys [:uri]
  defstruct [:uri]
end

defmodule Rocksky.Generated.GetApikeysOutput do
  @moduledoc false
  @type t :: %__MODULE__{
          apiKeys: list(term()) | nil
        }
  defstruct [:apiKeys]
end

defmodule Rocksky.Generated.GetApikeysParams do
  @moduledoc false
  @type t :: %__MODULE__{
          offset: integer() | nil,
          limit: integer() | nil
        }
  defstruct [:offset, :limit]
end

defmodule Rocksky.Generated.GetArtistAlbumsOutput do
  @moduledoc false
  @type t :: %__MODULE__{
          albums: list(Rocksky.Generated.AlbumViewBasic.t()) | nil
        }
  defstruct [:albums]
end

defmodule Rocksky.Generated.GetArtistAlbumsParams do
  @moduledoc false
  @type t :: %__MODULE__{
          uri: String.t()
        }
  @enforce_keys [:uri]
  defstruct [:uri]
end

defmodule Rocksky.Generated.GetArtistListenersOutput do
  @moduledoc false
  @type t :: %__MODULE__{
          listeners: list(Rocksky.Generated.ArtistListenerViewBasic.t()) | nil
        }
  defstruct [:listeners]
end

defmodule Rocksky.Generated.GetArtistListenersParams do
  @moduledoc false
  @type t :: %__MODULE__{
          uri: String.t(),
          offset: integer() | nil,
          limit: integer() | nil
        }
  @enforce_keys [:uri]
  defstruct [:uri, :offset, :limit]
end

defmodule Rocksky.Generated.GetArtistParams do
  @moduledoc false
  @type t :: %__MODULE__{
          uri: String.t()
        }
  @enforce_keys [:uri]
  defstruct [:uri]
end

defmodule Rocksky.Generated.GetArtistRecentListenersOutput do
  @moduledoc false
  @type t :: %__MODULE__{
          listeners: list(Rocksky.Generated.ArtistRecentListenerView.t()) | nil
        }
  defstruct [:listeners]
end

defmodule Rocksky.Generated.GetArtistRecentListenersParams do
  @moduledoc false
  @type t :: %__MODULE__{
          uri: String.t(),
          offset: integer() | nil,
          limit: integer() | nil
        }
  @enforce_keys [:uri]
  defstruct [:uri, :offset, :limit]
end

defmodule Rocksky.Generated.GetArtistRecommendationsParams do
  @moduledoc false
  @type t :: %__MODULE__{
          did: String.t(),
          limit: integer() | nil
        }
  @enforce_keys [:did]
  defstruct [:did, :limit]
end

defmodule Rocksky.Generated.GetArtistShoutsOutput do
  @moduledoc false
  @type t :: %__MODULE__{
          shouts: list(term()) | nil
        }
  defstruct [:shouts]
end

defmodule Rocksky.Generated.GetArtistShoutsParams do
  @moduledoc false
  @type t :: %__MODULE__{
          uri: String.t(),
          limit: integer() | nil,
          offset: integer() | nil
        }
  @enforce_keys [:uri]
  defstruct [:uri, :limit, :offset]
end

defmodule Rocksky.Generated.GetArtistsOutput do
  @moduledoc false
  @type t :: %__MODULE__{
          artists: list(Rocksky.Generated.ArtistViewBasic.t()) | nil
        }
  defstruct [:artists]
end

defmodule Rocksky.Generated.GetArtistsParams do
  @moduledoc false
  @type t :: %__MODULE__{
          limit: integer() | nil,
          offset: integer() | nil,
          names: String.t() | nil,
          genre: String.t() | nil
        }
  defstruct [:limit, :offset, :names, :genre]
end

defmodule Rocksky.Generated.GetArtistTracksOutput do
  @moduledoc false
  @type t :: %__MODULE__{
          tracks: list(Rocksky.Generated.SongViewBasic.t()) | nil
        }
  defstruct [:tracks]
end

defmodule Rocksky.Generated.GetArtistTracksParams do
  @moduledoc false
  @type t :: %__MODULE__{
          uri: String.t() | nil,
          limit: integer() | nil,
          offset: integer() | nil
        }
  defstruct [:uri, :limit, :offset]
end

defmodule Rocksky.Generated.GetCurrentlyPlayingParams do
  @moduledoc false
  @type t :: %__MODULE__{
          playerId: String.t() | nil,
          actor: String.t() | nil
        }
  defstruct [:playerId, :actor]
end

defmodule Rocksky.Generated.GetFeedGeneratorOutput do
  @moduledoc false
  @type t :: %__MODULE__{
          view: Rocksky.Generated.FeedGeneratorView.t() | nil
        }
  defstruct [:view]
end

defmodule Rocksky.Generated.GetFeedGeneratorParams do
  @moduledoc false
  @type t :: %__MODULE__{
          feed: String.t()
        }
  @enforce_keys [:feed]
  defstruct [:feed]
end

defmodule Rocksky.Generated.GetFeedGeneratorsParams do
  @moduledoc false
  @type t :: %__MODULE__{
          size: integer() | nil
        }
  defstruct [:size]
end

defmodule Rocksky.Generated.GetFeedParams do
  @moduledoc false
  @type t :: %__MODULE__{
          feed: String.t(),
          limit: integer() | nil,
          cursor: String.t() | nil
        }
  @enforce_keys [:feed]
  defstruct [:feed, :limit, :cursor]
end

defmodule Rocksky.Generated.GetFeedSkeletonOutput do
  @moduledoc false
  @type t :: %__MODULE__{
          scrobbles: list(Rocksky.Generated.ScrobbleViewBasic.t()) | nil,
          cursor: String.t() | nil
        }
  defstruct [:scrobbles, :cursor]
end

defmodule Rocksky.Generated.GetFeedSkeletonParams do
  @moduledoc false
  @type t :: %__MODULE__{
          feed: String.t(),
          limit: integer() | nil,
          offset: integer() | nil,
          cursor: String.t() | nil
        }
  @enforce_keys [:feed]
  defstruct [:feed, :limit, :offset, :cursor]
end

defmodule Rocksky.Generated.GetFileParams do
  @moduledoc false
  @type t :: %__MODULE__{
          fileId: String.t()
        }
  @enforce_keys [:fileId]
  defstruct [:fileId]
end

defmodule Rocksky.Generated.GetFilesParams do
  @moduledoc false
  @type t :: %__MODULE__{
          at: String.t() | nil
        }
  defstruct [:at]
end

defmodule Rocksky.Generated.GetFollowersOutput do
  @moduledoc false
  @type t :: %__MODULE__{
          subject: Rocksky.Generated.ActorProfileViewBasic.t(),
          followers: list(Rocksky.Generated.ActorProfileViewBasic.t()),
          cursor: String.t() | nil,
          count: integer() | nil
        }
  @enforce_keys [:subject, :followers]
  defstruct [:subject, :followers, :cursor, :count]
end

defmodule Rocksky.Generated.GetFollowersParams do
  @moduledoc false
  @type t :: %__MODULE__{
          actor: String.t(),
          limit: integer() | nil,
          dids: list(String.t()) | nil,
          cursor: String.t() | nil
        }
  @enforce_keys [:actor]
  defstruct [:actor, :limit, :dids, :cursor]
end

defmodule Rocksky.Generated.GetFollowsOutput do
  @moduledoc false
  @type t :: %__MODULE__{
          subject: Rocksky.Generated.ActorProfileViewBasic.t(),
          follows: list(Rocksky.Generated.ActorProfileViewBasic.t()),
          cursor: String.t() | nil,
          count: integer() | nil
        }
  @enforce_keys [:subject, :follows]
  defstruct [:subject, :follows, :cursor, :count]
end

defmodule Rocksky.Generated.GetFollowsParams do
  @moduledoc false
  @type t :: %__MODULE__{
          actor: String.t(),
          limit: integer() | nil,
          dids: list(String.t()) | nil,
          cursor: String.t() | nil
        }
  @enforce_keys [:actor]
  defstruct [:actor, :limit, :dids, :cursor]
end

defmodule Rocksky.Generated.GetKnownFollowersOutput do
  @moduledoc false
  @type t :: %__MODULE__{
          subject: Rocksky.Generated.ActorProfileViewBasic.t(),
          followers: list(Rocksky.Generated.ActorProfileViewBasic.t()),
          cursor: String.t() | nil
        }
  @enforce_keys [:subject, :followers]
  defstruct [:subject, :followers, :cursor]
end

defmodule Rocksky.Generated.GetKnownFollowersParams do
  @moduledoc false
  @type t :: %__MODULE__{
          actor: String.t(),
          limit: integer() | nil,
          cursor: String.t() | nil
        }
  @enforce_keys [:actor]
  defstruct [:actor, :limit, :cursor]
end

defmodule Rocksky.Generated.GetMetadataParams do
  @moduledoc false
  @type t :: %__MODULE__{
          path: String.t()
        }
  @enforce_keys [:path]
  defstruct [:path]
end

defmodule Rocksky.Generated.GetMirrorSourcesOutput do
  @moduledoc false
  @type t :: %__MODULE__{
          sources: list(Rocksky.Generated.MirrorSourceView.t())
        }
  @enforce_keys [:sources]
  defstruct [:sources]
end

defmodule Rocksky.Generated.GetMirrorSourcesParams do
  @moduledoc false
  @type t :: %__MODULE__{}
  defstruct []
end

defmodule Rocksky.Generated.GetPlaybackQueueParams do
  @moduledoc false
  @type t :: %__MODULE__{
          playerId: String.t() | nil
        }
  defstruct [:playerId]
end

defmodule Rocksky.Generated.GetPlaylistParams do
  @moduledoc false
  @type t :: %__MODULE__{
          uri: String.t()
        }
  @enforce_keys [:uri]
  defstruct [:uri]
end

defmodule Rocksky.Generated.GetPlaylistsOutput do
  @moduledoc false
  @type t :: %__MODULE__{
          playlists: list(Rocksky.Generated.PlaylistViewBasic.t()) | nil
        }
  defstruct [:playlists]
end

defmodule Rocksky.Generated.GetPlaylistsParams do
  @moduledoc false
  @type t :: %__MODULE__{
          limit: integer() | nil,
          offset: integer() | nil
        }
  defstruct [:limit, :offset]
end

defmodule Rocksky.Generated.GetProfileParams do
  @moduledoc false
  @type t :: %__MODULE__{
          did: String.t() | nil
        }
  defstruct [:did]
end

defmodule Rocksky.Generated.GetProfileShoutsOutput do
  @moduledoc false
  @type t :: %__MODULE__{
          shouts: list(term()) | nil
        }
  defstruct [:shouts]
end

defmodule Rocksky.Generated.GetProfileShoutsParams do
  @moduledoc false
  @type t :: %__MODULE__{
          did: String.t(),
          offset: integer() | nil,
          limit: integer() | nil
        }
  @enforce_keys [:did]
  defstruct [:did, :offset, :limit]
end

defmodule Rocksky.Generated.GetRecommendationsParams do
  @moduledoc false
  @type t :: %__MODULE__{
          did: String.t(),
          limit: integer() | nil
        }
  @enforce_keys [:did]
  defstruct [:did, :limit]
end

defmodule Rocksky.Generated.GetScrobbleParams do
  @moduledoc false
  @type t :: %__MODULE__{
          uri: String.t()
        }
  @enforce_keys [:uri]
  defstruct [:uri]
end

defmodule Rocksky.Generated.GetScrobblesChartParams do
  @moduledoc false
  @type t :: %__MODULE__{
          did: String.t() | nil,
          artisturi: String.t() | nil,
          albumuri: String.t() | nil,
          songuri: String.t() | nil,
          genre: String.t() | nil,
          from: String.t() | nil,
          to: String.t() | nil
        }
  defstruct [:did, :artisturi, :albumuri, :songuri, :genre, :from, :to]
end

defmodule Rocksky.Generated.GetScrobblesOutput do
  @moduledoc false
  @type t :: %__MODULE__{
          scrobbles: list(Rocksky.Generated.ScrobbleViewBasic.t()) | nil
        }
  defstruct [:scrobbles]
end

defmodule Rocksky.Generated.GetScrobblesParams do
  @moduledoc false
  @type t :: %__MODULE__{
          did: String.t() | nil,
          following: boolean() | nil,
          limit: integer() | nil,
          offset: integer() | nil
        }
  defstruct [:did, :following, :limit, :offset]
end

defmodule Rocksky.Generated.GetShoutRepliesOutput do
  @moduledoc false
  @type t :: %__MODULE__{
          shouts: list(term()) | nil
        }
  defstruct [:shouts]
end

defmodule Rocksky.Generated.GetShoutRepliesParams do
  @moduledoc false
  @type t :: %__MODULE__{
          uri: String.t(),
          limit: integer() | nil,
          offset: integer() | nil
        }
  @enforce_keys [:uri]
  defstruct [:uri, :limit, :offset]
end

defmodule Rocksky.Generated.GetSongParams do
  @moduledoc false
  @type t :: %__MODULE__{
          uri: String.t() | nil,
          mbid: String.t() | nil,
          isrc: String.t() | nil,
          spotifyId: String.t() | nil
        }
  defstruct [:uri, :mbid, :isrc, :spotifyId]
end

defmodule Rocksky.Generated.GetSongRecentListenersOutput do
  @moduledoc false
  @type t :: %__MODULE__{
          listeners: list(Rocksky.Generated.SongRecentListenerView.t()) | nil
        }
  defstruct [:listeners]
end

defmodule Rocksky.Generated.GetSongRecentListenersParams do
  @moduledoc false
  @type t :: %__MODULE__{
          uri: String.t(),
          offset: integer() | nil,
          limit: integer() | nil
        }
  @enforce_keys [:uri]
  defstruct [:uri, :offset, :limit]
end

defmodule Rocksky.Generated.GetSongsOutput do
  @moduledoc false
  @type t :: %__MODULE__{
          songs: list(Rocksky.Generated.SongViewBasic.t()) | nil
        }
  defstruct [:songs]
end

defmodule Rocksky.Generated.GetSongsParams do
  @moduledoc false
  @type t :: %__MODULE__{
          limit: integer() | nil,
          offset: integer() | nil,
          genre: String.t() | nil,
          mbid: String.t() | nil,
          isrc: String.t() | nil,
          spotifyId: String.t() | nil
        }
  defstruct [:limit, :offset, :genre, :mbid, :isrc, :spotifyId]
end

defmodule Rocksky.Generated.GetStatsParams do
  @moduledoc false
  @type t :: %__MODULE__{
          did: String.t()
        }
  @enforce_keys [:did]
  defstruct [:did]
end

defmodule Rocksky.Generated.GetStoriesParams do
  @moduledoc false
  @type t :: %__MODULE__{
          size: integer() | nil
        }
  defstruct [:size]
end

defmodule Rocksky.Generated.GetTemporaryLinkParams do
  @moduledoc false
  @type t :: %__MODULE__{
          path: String.t()
        }
  @enforce_keys [:path]
  defstruct [:path]
end

defmodule Rocksky.Generated.GetTopArtistsOutput do
  @moduledoc false
  @type t :: %__MODULE__{
          artists: list(Rocksky.Generated.ArtistViewBasic.t()) | nil
        }
  defstruct [:artists]
end

defmodule Rocksky.Generated.GetTopArtistsParams do
  @moduledoc false
  @type t :: %__MODULE__{
          limit: integer() | nil,
          offset: integer() | nil,
          startDate: String.t() | nil,
          endDate: String.t() | nil
        }
  defstruct [:limit, :offset, :startDate, :endDate]
end

defmodule Rocksky.Generated.GetTopTracksOutput do
  @moduledoc false
  @type t :: %__MODULE__{
          tracks: list(Rocksky.Generated.SongViewBasic.t()) | nil
        }
  defstruct [:tracks]
end

defmodule Rocksky.Generated.GetTopTracksParams do
  @moduledoc false
  @type t :: %__MODULE__{
          limit: integer() | nil,
          offset: integer() | nil,
          startDate: String.t() | nil,
          endDate: String.t() | nil
        }
  defstruct [:limit, :offset, :startDate, :endDate]
end

defmodule Rocksky.Generated.GetTrackShoutsOutput do
  @moduledoc false
  @type t :: %__MODULE__{
          shouts: list(term()) | nil
        }
  defstruct [:shouts]
end

defmodule Rocksky.Generated.GetTrackShoutsParams do
  @moduledoc false
  @type t :: %__MODULE__{
          uri: String.t()
        }
  @enforce_keys [:uri]
  defstruct [:uri]
end

defmodule Rocksky.Generated.GetWrappedParams do
  @moduledoc false
  @type t :: %__MODULE__{
          did: String.t(),
          year: integer() | nil
        }
  @enforce_keys [:did]
  defstruct [:did, :year]
end

defmodule Rocksky.Generated.GoogledriveFileListView do
  @moduledoc false
  @type t :: %__MODULE__{
          files: list(Rocksky.Generated.GoogledriveFileView.t()) | nil
        }
  defstruct [:files]
end

defmodule Rocksky.Generated.GoogledriveFileView do
  @moduledoc false
  @type t :: %__MODULE__{
          id: String.t() | nil
        }
  defstruct [:id]
end

defmodule Rocksky.Generated.GraphNotFoundActor do
  @moduledoc "indicates that a handle or DID could not be resolved"
  @type t :: %__MODULE__{
          actor: String.t(),
          notFound: boolean()
        }
  @enforce_keys [:actor, :notFound]
  defstruct [:actor, :notFound]
end

defmodule Rocksky.Generated.GraphRelationship do
  @moduledoc false
  @type t :: %__MODULE__{
          did: String.t(),
          following: String.t() | nil,
          followedBy: String.t() | nil
        }
  @enforce_keys [:did]
  defstruct [:did, :following, :followedBy]
end

defmodule Rocksky.Generated.InsertDirectoryParams do
  @moduledoc false
  @type t :: %__MODULE__{
          uri: String.t(),
          directory: String.t(),
          position: integer() | nil
        }
  @enforce_keys [:uri, :directory]
  defstruct [:uri, :directory, :position]
end

defmodule Rocksky.Generated.InsertFilesParams do
  @moduledoc false
  @type t :: %__MODULE__{
          uri: String.t(),
          files: list(String.t()),
          position: integer() | nil
        }
  @enforce_keys [:uri, :files]
  defstruct [:uri, :files, :position]
end

defmodule Rocksky.Generated.LikeRecord do
  @moduledoc false
  @type t :: %__MODULE__{
          createdAt: String.t(),
          subject: Rocksky.Generated.StrongRef.t()
        }
  @enforce_keys [:createdAt, :subject]
  defstruct [:createdAt, :subject]
end

defmodule Rocksky.Generated.LikeShoutInput do
  @moduledoc false
  @type t :: %__MODULE__{
          uri: String.t() | nil
        }
  defstruct [:uri]
end

defmodule Rocksky.Generated.LikeSongInput do
  @moduledoc false
  @type t :: %__MODULE__{
          uri: String.t() | nil
        }
  defstruct [:uri]
end

defmodule Rocksky.Generated.MatchSongParams do
  @moduledoc false
  @type t :: %__MODULE__{
          title: String.t(),
          artist: String.t(),
          mbId: String.t() | nil,
          isrc: String.t() | nil
        }
  @enforce_keys [:title, :artist]
  defstruct [:title, :artist, :mbId, :isrc]
end

defmodule Rocksky.Generated.MirrorSourceView do
  @moduledoc false
  @type t :: %__MODULE__{
          provider: String.t(),
          enabled: boolean(),
          externalUsername: String.t() | nil,
          hasCredentials: boolean(),
          lastPolledAt: String.t() | nil,
          lastScrobbleSeenAt: String.t() | nil
        }
  @enforce_keys [:provider, :enabled, :hasCredentials]
  defstruct [:provider, :enabled, :externalUsername, :hasCredentials, :lastPolledAt, :lastScrobbleSeenAt]
end

defmodule Rocksky.Generated.NextParams do
  @moduledoc false
  @type t :: %__MODULE__{
          playerId: String.t() | nil
        }
  defstruct [:playerId]
end

defmodule Rocksky.Generated.PauseParams do
  @moduledoc false
  @type t :: %__MODULE__{
          playerId: String.t() | nil
        }
  defstruct [:playerId]
end

defmodule Rocksky.Generated.PlayDirectoryParams do
  @moduledoc false
  @type t :: %__MODULE__{
          playerId: String.t() | nil,
          directoryId: String.t(),
          shuffle: boolean() | nil,
          recurse: boolean() | nil,
          position: integer() | nil
        }
  @enforce_keys [:directoryId]
  defstruct [:playerId, :directoryId, :shuffle, :recurse, :position]
end

defmodule Rocksky.Generated.PlayerCurrentlyPlayingViewDetailed do
  @moduledoc false
  @type t :: %__MODULE__{
          title: String.t() | nil
        }
  defstruct [:title]
end

defmodule Rocksky.Generated.PlayerPlaybackQueueViewDetailed do
  @moduledoc false
  @type t :: %__MODULE__{
          tracks: list(Rocksky.Generated.SongViewBasic.t()) | nil
        }
  defstruct [:tracks]
end

defmodule Rocksky.Generated.PlayFileParams do
  @moduledoc false
  @type t :: %__MODULE__{
          playerId: String.t() | nil,
          fileId: String.t()
        }
  @enforce_keys [:fileId]
  defstruct [:playerId, :fileId]
end

defmodule Rocksky.Generated.PlaylistItemRecord do
  @moduledoc false
  @type t :: %__MODULE__{
          subject: Rocksky.Generated.StrongRef.t(),
          createdAt: String.t(),
          track: Rocksky.Generated.SongViewBasic.t(),
          order: integer()
        }
  @enforce_keys [:subject, :createdAt, :track, :order]
  defstruct [:subject, :createdAt, :track, :order]
end

defmodule Rocksky.Generated.PlaylistRecord do
  @moduledoc false
  @type t :: %__MODULE__{
          name: String.t(),
          description: String.t() | nil,
          picture: Rocksky.Generated.BlobRef.t() | nil,
          pictureUrl: String.t() | nil,
          createdAt: String.t(),
          spotifyLink: String.t() | nil,
          tidalLink: String.t() | nil,
          youtubeLink: String.t() | nil,
          appleMusicLink: String.t() | nil
        }
  @enforce_keys [:name, :createdAt]
  defstruct [:name, :description, :picture, :pictureUrl, :createdAt, :spotifyLink, :tidalLink, :youtubeLink, :appleMusicLink]
end

defmodule Rocksky.Generated.PlaylistViewBasic do
  @moduledoc "Basic view of a playlist, including its metadata"
  @type t :: %__MODULE__{
          id: String.t() | nil,
          title: String.t() | nil,
          uri: String.t() | nil,
          curatorDid: String.t() | nil,
          curatorHandle: String.t() | nil,
          curatorName: String.t() | nil,
          curatorAvatarUrl: String.t() | nil,
          description: String.t() | nil,
          coverImageUrl: String.t() | nil,
          createdAt: String.t() | nil,
          trackCount: integer() | nil
        }
  defstruct [:id, :title, :uri, :curatorDid, :curatorHandle, :curatorName, :curatorAvatarUrl, :description, :coverImageUrl, :createdAt, :trackCount]
end

defmodule Rocksky.Generated.PlaylistViewDetailed do
  @moduledoc "Detailed view of a playlist, including its tracks and metadata"
  @type t :: %__MODULE__{
          id: String.t() | nil,
          title: String.t() | nil,
          uri: String.t() | nil,
          curatorDid: String.t() | nil,
          curatorHandle: String.t() | nil,
          curatorName: String.t() | nil,
          curatorAvatarUrl: String.t() | nil,
          description: String.t() | nil,
          coverImageUrl: String.t() | nil,
          createdAt: String.t() | nil,
          tracks: list(Rocksky.Generated.SongViewBasic.t()) | nil
        }
  defstruct [:id, :title, :uri, :curatorDid, :curatorHandle, :curatorName, :curatorAvatarUrl, :description, :coverImageUrl, :createdAt, :tracks]
end

defmodule Rocksky.Generated.PlayParams do
  @moduledoc false
  @type t :: %__MODULE__{
          playerId: String.t() | nil
        }
  defstruct [:playerId]
end

defmodule Rocksky.Generated.PreviousParams do
  @moduledoc false
  @type t :: %__MODULE__{
          playerId: String.t() | nil
        }
  defstruct [:playerId]
end

defmodule Rocksky.Generated.ProfileRecord do
  @moduledoc false
  @type t :: %__MODULE__{
          displayName: String.t() | nil,
          description: String.t() | nil,
          avatar: Rocksky.Generated.BlobRef.t() | nil,
          banner: Rocksky.Generated.BlobRef.t() | nil,
          labels: term() | nil,
          joinedViaStarterPack: Rocksky.Generated.StrongRef.t() | nil,
          createdAt: String.t() | nil
        }
  defstruct [:displayName, :description, :avatar, :banner, :labels, :joinedViaStarterPack, :createdAt]
end

defmodule Rocksky.Generated.PutMirrorSourceInput do
  @moduledoc false
  @type t :: %__MODULE__{
          provider: String.t(),
          enabled: boolean() | nil,
          externalUsername: String.t() | nil,
          apiKey: String.t() | nil
        }
  @enforce_keys [:provider]
  defstruct [:provider, :enabled, :externalUsername, :apiKey]
end

defmodule Rocksky.Generated.RadioRecord do
  @moduledoc false
  @type t :: %__MODULE__{
          name: String.t(),
          url: String.t(),
          description: String.t() | nil,
          genre: String.t() | nil,
          logo: Rocksky.Generated.BlobRef.t() | nil,
          website: String.t() | nil,
          createdAt: String.t()
        }
  @enforce_keys [:name, :url, :createdAt]
  defstruct [:name, :url, :description, :genre, :logo, :website, :createdAt]
end

defmodule Rocksky.Generated.RadioViewBasic do
  @moduledoc false
  @type t :: %__MODULE__{
          id: String.t() | nil,
          name: String.t() | nil,
          description: String.t() | nil,
          createdAt: String.t() | nil
        }
  defstruct [:id, :name, :description, :createdAt]
end

defmodule Rocksky.Generated.RadioViewDetailed do
  @moduledoc false
  @type t :: %__MODULE__{
          id: String.t() | nil,
          name: String.t() | nil,
          description: String.t() | nil,
          website: String.t() | nil,
          url: String.t() | nil,
          genre: String.t() | nil,
          logo: String.t() | nil,
          createdAt: String.t() | nil
        }
  defstruct [:id, :name, :description, :website, :url, :genre, :logo, :createdAt]
end

defmodule Rocksky.Generated.RemoveApikeyParams do
  @moduledoc false
  @type t :: %__MODULE__{
          id: String.t()
        }
  @enforce_keys [:id]
  defstruct [:id]
end

defmodule Rocksky.Generated.RemovePlaylistParams do
  @moduledoc false
  @type t :: %__MODULE__{
          uri: String.t()
        }
  @enforce_keys [:uri]
  defstruct [:uri]
end

defmodule Rocksky.Generated.RemoveShoutParams do
  @moduledoc false
  @type t :: %__MODULE__{
          id: String.t()
        }
  @enforce_keys [:id]
  defstruct [:id]
end

defmodule Rocksky.Generated.RemoveTrackParams do
  @moduledoc false
  @type t :: %__MODULE__{
          uri: String.t(),
          position: integer()
        }
  @enforce_keys [:uri, :position]
  defstruct [:uri, :position]
end

defmodule Rocksky.Generated.ReplyShoutInput do
  @moduledoc false
  @type t :: %__MODULE__{
          shoutId: String.t(),
          message: String.t()
        }
  @enforce_keys [:shoutId, :message]
  defstruct [:shoutId, :message]
end

defmodule Rocksky.Generated.ReportShoutInput do
  @moduledoc false
  @type t :: %__MODULE__{
          shoutId: String.t(),
          reason: String.t() | nil
        }
  @enforce_keys [:shoutId]
  defstruct [:shoutId, :reason]
end

defmodule Rocksky.Generated.ScrobbleFirstScrobbleView do
  @moduledoc false
  @type t :: %__MODULE__{
          handle: String.t() | nil,
          avatar: String.t() | nil,
          timestamp: String.t() | nil
        }
  defstruct [:handle, :avatar, :timestamp]
end

defmodule Rocksky.Generated.ScrobbleRecord do
  @moduledoc false
  @type t :: %__MODULE__{
          title: String.t(),
          artist: String.t(),
          artists: list(Rocksky.Generated.ArtistMbid.t()) | nil,
          albumArtist: String.t(),
          album: String.t(),
          duration: integer(),
          trackNumber: integer() | nil,
          discNumber: integer() | nil,
          releaseDate: String.t() | nil,
          year: integer() | nil,
          genre: String.t() | nil,
          tags: list(String.t()) | nil,
          composer: String.t() | nil,
          lyrics: String.t() | nil,
          copyrightMessage: String.t() | nil,
          wiki: String.t() | nil,
          albumArt: Rocksky.Generated.BlobRef.t() | nil,
          albumArtUrl: String.t() | nil,
          youtubeLink: String.t() | nil,
          spotifyLink: String.t() | nil,
          tidalLink: String.t() | nil,
          appleMusicLink: String.t() | nil,
          createdAt: String.t(),
          mbid: String.t() | nil,
          label: String.t() | nil,
          isrc: String.t() | nil
        }
  @enforce_keys [:title, :artist, :albumArtist, :album, :duration, :createdAt]
  defstruct [:title, :artist, :artists, :albumArtist, :album, :duration, :trackNumber, :discNumber, :releaseDate, :year, :genre, :tags, :composer, :lyrics, :copyrightMessage, :wiki, :albumArt, :albumArtUrl, :youtubeLink, :spotifyLink, :tidalLink, :appleMusicLink, :createdAt, :mbid, :label, :isrc]
end

defmodule Rocksky.Generated.ScrobbleViewBasic do
  @moduledoc false
  @type t :: %__MODULE__{
          id: String.t() | nil,
          user: String.t() | nil,
          userDisplayName: String.t() | nil,
          userAvatar: String.t() | nil,
          title: String.t() | nil,
          artist: String.t() | nil,
          artistUri: String.t() | nil,
          album: String.t() | nil,
          albumUri: String.t() | nil,
          cover: String.t() | nil,
          date: String.t() | nil,
          uri: String.t() | nil,
          sha256: String.t() | nil,
          liked: boolean() | nil,
          likesCount: integer() | nil
        }
  defstruct [:id, :user, :userDisplayName, :userAvatar, :title, :artist, :artistUri, :album, :albumUri, :cover, :date, :uri, :sha256, :liked, :likesCount]
end

defmodule Rocksky.Generated.ScrobbleViewDetailed do
  @moduledoc false
  @type t :: %__MODULE__{
          id: String.t() | nil,
          user: String.t() | nil,
          title: String.t() | nil,
          artist: String.t() | nil,
          artistUri: String.t() | nil,
          album: String.t() | nil,
          albumUri: String.t() | nil,
          cover: String.t() | nil,
          date: String.t() | nil,
          uri: String.t() | nil,
          sha256: String.t() | nil,
          liked: boolean() | nil,
          likesCount: integer() | nil,
          listeners: integer() | nil,
          scrobbles: integer() | nil,
          artists: list(Rocksky.Generated.ArtistViewBasic.t()) | nil,
          firstScrobble: Rocksky.Generated.ScrobbleFirstScrobbleView.t() | nil
        }
  defstruct [:id, :user, :title, :artist, :artistUri, :album, :albumUri, :cover, :date, :uri, :sha256, :liked, :likesCount, :listeners, :scrobbles, :artists, :firstScrobble]
end

defmodule Rocksky.Generated.SearchParams do
  @moduledoc false
  @type t :: %__MODULE__{
          query: String.t()
        }
  @enforce_keys [:query]
  defstruct [:query]
end

defmodule Rocksky.Generated.SeekParams do
  @moduledoc false
  @type t :: %__MODULE__{
          playerId: String.t() | nil,
          position: integer()
        }
  @enforce_keys [:position]
  defstruct [:playerId, :position]
end

defmodule Rocksky.Generated.ShoutAuthor do
  @moduledoc false
  @type t :: %__MODULE__{
          id: String.t() | nil,
          did: String.t() | nil,
          handle: String.t() | nil,
          displayName: String.t() | nil,
          avatar: String.t() | nil
        }
  defstruct [:id, :did, :handle, :displayName, :avatar]
end

defmodule Rocksky.Generated.ShoutRecord do
  @moduledoc false
  @type t :: %__MODULE__{
          message: String.t(),
          createdAt: String.t(),
          parent: Rocksky.Generated.StrongRef.t() | nil,
          subject: Rocksky.Generated.StrongRef.t()
        }
  @enforce_keys [:message, :createdAt, :subject]
  defstruct [:message, :createdAt, :parent, :subject]
end

defmodule Rocksky.Generated.ShoutView do
  @moduledoc false
  @type t :: %__MODULE__{
          id: String.t() | nil,
          message: String.t() | nil,
          parent: String.t() | nil,
          createdAt: String.t() | nil,
          author: Rocksky.Generated.ShoutAuthor.t() | nil
        }
  defstruct [:id, :message, :parent, :createdAt, :author]
end

defmodule Rocksky.Generated.SongFirstScrobbleView do
  @moduledoc false
  @type t :: %__MODULE__{
          handle: String.t() | nil,
          avatar: String.t() | nil,
          timestamp: String.t() | nil
        }
  defstruct [:handle, :avatar, :timestamp]
end

defmodule Rocksky.Generated.SongRecentListenerView do
  @moduledoc false
  @type t :: %__MODULE__{
          id: String.t() | nil,
          did: String.t() | nil,
          handle: String.t() | nil,
          displayName: String.t() | nil,
          avatar: String.t() | nil,
          timestamp: String.t() | nil,
          scrobbleUri: String.t() | nil
        }
  defstruct [:id, :did, :handle, :displayName, :avatar, :timestamp, :scrobbleUri]
end

defmodule Rocksky.Generated.SongRecord do
  @moduledoc false
  @type t :: %__MODULE__{
          title: String.t(),
          artist: String.t(),
          artists: list(Rocksky.Generated.ArtistMbid.t()) | nil,
          albumArtist: String.t(),
          album: String.t(),
          duration: integer(),
          trackNumber: integer() | nil,
          discNumber: integer() | nil,
          releaseDate: String.t() | nil,
          year: integer() | nil,
          genre: String.t() | nil,
          tags: list(String.t()) | nil,
          composer: String.t() | nil,
          lyrics: String.t() | nil,
          copyrightMessage: String.t() | nil,
          wiki: String.t() | nil,
          albumArt: Rocksky.Generated.BlobRef.t() | nil,
          albumArtUrl: String.t() | nil,
          youtubeLink: String.t() | nil,
          spotifyLink: String.t() | nil,
          tidalLink: String.t() | nil,
          appleMusicLink: String.t() | nil,
          createdAt: String.t(),
          mbid: String.t() | nil,
          label: String.t() | nil,
          isrc: String.t() | nil
        }
  @enforce_keys [:title, :artist, :albumArtist, :album, :duration, :createdAt]
  defstruct [:title, :artist, :artists, :albumArtist, :album, :duration, :trackNumber, :discNumber, :releaseDate, :year, :genre, :tags, :composer, :lyrics, :copyrightMessage, :wiki, :albumArt, :albumArtUrl, :youtubeLink, :spotifyLink, :tidalLink, :appleMusicLink, :createdAt, :mbid, :label, :isrc]
end

defmodule Rocksky.Generated.SongViewBasic do
  @moduledoc false
  @type t :: %__MODULE__{
          id: String.t() | nil,
          title: String.t() | nil,
          artist: String.t() | nil,
          albumArtist: String.t() | nil,
          albumArt: String.t() | nil,
          uri: String.t() | nil,
          album: String.t() | nil,
          duration: integer() | nil,
          trackNumber: integer() | nil,
          discNumber: integer() | nil,
          playCount: integer() | nil,
          uniqueListeners: integer() | nil,
          albumUri: String.t() | nil,
          artistUri: String.t() | nil,
          sha256: String.t() | nil,
          mbid: String.t() | nil,
          isrc: String.t() | nil,
          tags: list(String.t()) | nil,
          createdAt: String.t() | nil
        }
  defstruct [:id, :title, :artist, :albumArtist, :albumArt, :uri, :album, :duration, :trackNumber, :discNumber, :playCount, :uniqueListeners, :albumUri, :artistUri, :sha256, :mbid, :isrc, :tags, :createdAt]
end

defmodule Rocksky.Generated.SongViewDetailed do
  @moduledoc false
  @type t :: %__MODULE__{
          id: String.t() | nil,
          title: String.t() | nil,
          artist: String.t() | nil,
          albumArtist: String.t() | nil,
          albumArt: String.t() | nil,
          uri: String.t() | nil,
          album: String.t() | nil,
          duration: integer() | nil,
          trackNumber: integer() | nil,
          discNumber: integer() | nil,
          playCount: integer() | nil,
          uniqueListeners: integer() | nil,
          albumUri: String.t() | nil,
          artistUri: String.t() | nil,
          sha256: String.t() | nil,
          mbid: String.t() | nil,
          isrc: String.t() | nil,
          tags: list(String.t()) | nil,
          createdAt: String.t() | nil,
          artists: list(Rocksky.Generated.ArtistViewBasic.t()) | nil,
          firstScrobble: Rocksky.Generated.SongFirstScrobbleView.t() | nil
        }
  defstruct [:id, :title, :artist, :albumArtist, :albumArt, :uri, :album, :duration, :trackNumber, :discNumber, :playCount, :uniqueListeners, :albumUri, :artistUri, :sha256, :mbid, :isrc, :tags, :createdAt, :artists, :firstScrobble]
end

defmodule Rocksky.Generated.SpotifyTrackView do
  @moduledoc false
  @type t :: %__MODULE__{
          id: String.t() | nil,
          name: String.t() | nil,
          artist: String.t() | nil,
          album: String.t() | nil,
          duration: integer() | nil,
          previewUrl: String.t() | nil
        }
  defstruct [:id, :name, :artist, :album, :duration, :previewUrl]
end

defmodule Rocksky.Generated.StartPlaylistParams do
  @moduledoc false
  @type t :: %__MODULE__{
          uri: String.t(),
          shuffle: boolean() | nil,
          position: integer() | nil
        }
  @enforce_keys [:uri]
  defstruct [:uri, :shuffle, :position]
end

defmodule Rocksky.Generated.StatsView do
  @moduledoc false
  @type t :: %__MODULE__{
          scrobbles: integer() | nil,
          artists: integer() | nil,
          lovedTracks: integer() | nil,
          albums: integer() | nil,
          tracks: integer() | nil
        }
  defstruct [:scrobbles, :artists, :lovedTracks, :albums, :tracks]
end

defmodule Rocksky.Generated.StatsWrappedAlbum do
  @moduledoc false
  @type t :: %__MODULE__{
          id: String.t() | nil,
          title: String.t() | nil,
          artist: String.t() | nil,
          albumArt: String.t() | nil,
          uri: String.t() | nil,
          playCount: integer() | nil
        }
  defstruct [:id, :title, :artist, :albumArt, :uri, :playCount]
end

defmodule Rocksky.Generated.StatsWrappedArtist do
  @moduledoc false
  @type t :: %__MODULE__{
          id: String.t() | nil,
          name: String.t() | nil,
          picture: String.t() | nil,
          uri: String.t() | nil,
          playCount: integer() | nil
        }
  defstruct [:id, :name, :picture, :uri, :playCount]
end

defmodule Rocksky.Generated.StatsWrappedDayCount do
  @moduledoc false
  @type t :: %__MODULE__{
          date: String.t() | nil,
          count: integer() | nil
        }
  defstruct [:date, :count]
end

defmodule Rocksky.Generated.StatsWrappedGenreCount do
  @moduledoc false
  @type t :: %__MODULE__{
          genre: String.t() | nil,
          count: integer() | nil
        }
  defstruct [:genre, :count]
end

defmodule Rocksky.Generated.StatsWrappedMilestone do
  @moduledoc false
  @type t :: %__MODULE__{
          trackTitle: String.t() | nil,
          artistName: String.t() | nil,
          timestamp: String.t() | nil,
          trackUri: String.t() | nil
        }
  defstruct [:trackTitle, :artistName, :timestamp, :trackUri]
end

defmodule Rocksky.Generated.StatsWrappedMonthCount do
  @moduledoc false
  @type t :: %__MODULE__{
          month: integer() | nil,
          count: integer() | nil
        }
  defstruct [:month, :count]
end

defmodule Rocksky.Generated.StatsWrappedTrack do
  @moduledoc false
  @type t :: %__MODULE__{
          id: String.t() | nil,
          title: String.t() | nil,
          artist: String.t() | nil,
          albumArt: String.t() | nil,
          uri: String.t() | nil,
          artistUri: String.t() | nil,
          albumUri: String.t() | nil,
          playCount: integer() | nil
        }
  defstruct [:id, :title, :artist, :albumArt, :uri, :artistUri, :albumUri, :playCount]
end

defmodule Rocksky.Generated.StatsWrappedView do
  @moduledoc false
  @type t :: %__MODULE__{
          year: integer() | nil,
          totalScrobbles: integer() | nil,
          totalListeningTimeMinutes: integer() | nil,
          topArtists: list(Rocksky.Generated.StatsWrappedArtist.t()) | nil,
          topTracks: list(Rocksky.Generated.StatsWrappedTrack.t()) | nil,
          topAlbums: list(Rocksky.Generated.StatsWrappedAlbum.t()) | nil,
          topGenres: list(Rocksky.Generated.StatsWrappedGenreCount.t()) | nil,
          scrobblesPerMonth: list(Rocksky.Generated.StatsWrappedMonthCount.t()) | nil,
          mostActiveDay: Rocksky.Generated.StatsWrappedDayCount.t() | nil,
          mostActiveHour: integer() | nil,
          newArtistsCount: integer() | nil,
          longestStreak: integer() | nil,
          firstScrobble: Rocksky.Generated.StatsWrappedMilestone.t() | nil,
          lastScrobble: Rocksky.Generated.StatsWrappedMilestone.t() | nil
        }
  defstruct [:year, :totalScrobbles, :totalListeningTimeMinutes, :topArtists, :topTracks, :topAlbums, :topGenres, :scrobblesPerMonth, :mostActiveDay, :mostActiveHour, :newArtistsCount, :longestStreak, :firstScrobble, :lastScrobble]
end

defmodule Rocksky.Generated.StatusRecord do
  @moduledoc false
  @type t :: %__MODULE__{
          track: Rocksky.Generated.ActorTrackView.t(),
          startedAt: String.t(),
          expiresAt: String.t() | nil
        }
  @enforce_keys [:track, :startedAt]
  defstruct [:track, :startedAt, :expiresAt]
end

defmodule Rocksky.Generated.StrongRef do
  @moduledoc false
  @type t :: %__MODULE__{
          uri: String.t(),
          cid: String.t()
        }
  @enforce_keys [:uri, :cid]
  defstruct [:uri, :cid]
end

defmodule Rocksky.Generated.UnfollowAccountOutput do
  @moduledoc false
  @type t :: %__MODULE__{
          subject: Rocksky.Generated.ActorProfileViewBasic.t(),
          followers: list(Rocksky.Generated.ActorProfileViewBasic.t()),
          cursor: String.t() | nil
        }
  @enforce_keys [:subject, :followers]
  defstruct [:subject, :followers, :cursor]
end

defmodule Rocksky.Generated.UnfollowAccountParams do
  @moduledoc false
  @type t :: %__MODULE__{
          account: String.t()
        }
  @enforce_keys [:account]
  defstruct [:account]
end

defmodule Rocksky.Generated.UpdateApikeyInput do
  @moduledoc false
  @type t :: %__MODULE__{
          id: String.t(),
          name: String.t(),
          description: String.t() | nil
        }
  @enforce_keys [:id, :name]
  defstruct [:id, :name, :description]
end
