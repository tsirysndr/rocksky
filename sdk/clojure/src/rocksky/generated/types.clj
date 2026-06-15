;; AUTO-GENERATED FILE -- DO NOT EDIT.
;; Source: apps/api/lexicons/**/*.json
;; Regenerate via: bun run lexgen:types

(ns rocksky.generated.types)

(def ^{:doc "Lexicon-derived schemas in malli format. Refs are :TypeName keywords."}
  schemas
  {   :ActorArtistViewBasic
   [:map
    [:id {:optional true} :string]
    [:name {:optional true} :string]
    [:picture {:optional true} :string]
    [:uri {:optional true} :string]
    [:user1Rank {:optional true} :int]
    [:user2Rank {:optional true} :int]
    [:weight {:optional true} :int]
    ]
   :ActorCompatibilityViewBasic
   [:map
    [:compatibilityLevel {:optional true} :int]
    [:compatibilityPercentage {:optional true} :int]
    [:sharedArtists {:optional true} :int]
    [:topSharedArtistNames {:optional true} [:vector :string]]
    [:topSharedDetailedArtists {:optional true} [:vector :ActorArtistViewBasic]]
    [:user1ArtistCount {:optional true} :int]
    [:user2ArtistCount {:optional true} :int]
    ]
   :ActorNeighbourViewBasic
   [:map
    [:userId {:optional true} :string]
    [:did {:optional true} :string]
    [:handle {:optional true} :string]
    [:displayName {:optional true} :string]
    ;; The URL of the actor's avatar image.
    [:avatar {:optional true} :string]
    ;; The number of artists shared with the actor.
    [:sharedArtistsCount {:optional true} :int]
    ;; The similarity score with the actor.
    [:similarityScore {:optional true} :int]
    ;; The top shared artist names with the actor.
    [:topSharedArtistNames {:optional true} [:vector :string]]
    ;; The top shared artist details with the actor.
    [:topSharedArtistsDetails {:optional true} [:vector :ArtistViewBasic]]
    ]
   :ActorProfileViewBasic
   [:map
    ;; The unique identifier of the actor.
    [:id {:optional true} :string]
    ;; The DID of the actor.
    [:did {:optional true} :string]
    ;; The handle of the actor.
    [:handle {:optional true} :string]
    ;; The display name of the actor.
    [:displayName {:optional true} :string]
    ;; The URL of the actor's avatar image.
    [:avatar {:optional true} :string]
    ;; The date and time when the actor was created.
    [:createdAt {:optional true} :string]
    ;; The date and time when the actor was last updated.
    [:updatedAt {:optional true} :string]
    ]
   :ActorProfileViewDetailed
   [:map
    ;; The unique identifier of the actor.
    [:id {:optional true} :string]
    ;; The DID of the actor.
    [:did {:optional true} :string]
    ;; The handle of the actor.
    [:handle {:optional true} :string]
    ;; The display name of the actor.
    [:displayName {:optional true} :string]
    ;; The URL of the actor's avatar image.
    [:avatar {:optional true} :string]
    ;; The date and time when the actor was created.
    [:createdAt {:optional true} :string]
    ;; The date and time when the actor was last updated.
    [:updatedAt {:optional true} :string]
    ]
   :ActorTrackView
   [:map
    ;; The name of the track.
    [:name :string]
    ;; The primary artist name.
    [:artist :string]
    ;; The album name.
    [:album {:optional true} :string]
    ;; URL of the album cover image.
    [:albumCoverUrl {:optional true} :string]
    ;; Track duration in milliseconds.
    [:durationMs {:optional true} :int]
    ;; Music service source, e.g. 'spotify' or 'listenbrainz'.
    [:source {:optional true} :string]
    ;; MusicBrainz recording ID, if available.
    [:recordingMbId {:optional true} :string]
    ]
   :AddDirectoryToQueueParams
   [:map
    [:playerId {:optional true} :string]
    ;; The directory to add to the queue
    [:directory :string]
    ;; Position in the queue to insert the directory at, defaults to the end if not specified
    [:position {:optional true} :int]
    ;; Whether to shuffle the added directory in the queue
    [:shuffle {:optional true} :boolean]
    ]
   :AddItemsToQueueParams
   [:map
    [:playerId {:optional true} :string]
    [:items [:vector :string]]
    ;; Position in the queue to insert the items at, defaults to the end if not specified
    [:position {:optional true} :int]
    ;; Whether to shuffle the added items in the queue
    [:shuffle {:optional true} :boolean]
    ]
   :AlbumRecord
   [:map
    ;; The title of the album.
    [:title :string]
    ;; The artist of the album.
    [:artist :string]
    ;; The duration of the album in milliseconds.
    [:duration {:optional true} :int]
    ;; The release date of the album.
    [:releaseDate {:optional true} :string]
    ;; The year the album was released.
    [:year {:optional true} :int]
    ;; The genre of the album.
    [:genre {:optional true} :string]
    ;; The album art of the album.
    [:albumArt {:optional true} :BlobRef]
    ;; The URL of the album art of the album.
    [:albumArtUrl {:optional true} :string]
    ;; The tags of the album.
    [:tags {:optional true} [:vector :string]]
    ;; The YouTube link of the album.
    [:youtubeLink {:optional true} :string]
    ;; The Spotify link of the album.
    [:spotifyLink {:optional true} :string]
    ;; The tidal link of the album.
    [:tidalLink {:optional true} :string]
    ;; The Apple Music link of the album.
    [:appleMusicLink {:optional true} :string]
    ;; The date and time when the album was created.
    [:createdAt :string]
    ]
   :AlbumViewBasic
   [:map
    ;; The unique identifier of the album.
    [:id {:optional true} :string]
    ;; The URI of the album.
    [:uri {:optional true} :string]
    ;; The title of the album.
    [:title {:optional true} :string]
    ;; The artist of the album.
    [:artist {:optional true} :string]
    ;; The URI of the album's artist.
    [:artistUri {:optional true} :string]
    ;; The year the album was released.
    [:year {:optional true} :int]
    ;; The URL of the album art image.
    [:albumArt {:optional true} :string]
    ;; The release date of the album.
    [:releaseDate {:optional true} :string]
    ;; The SHA256 hash of the album.
    [:sha256 {:optional true} :string]
    ;; The number of times the album has been played.
    [:playCount {:optional true} :int]
    ;; The number of unique listeners who have played the album.
    [:uniqueListeners {:optional true} :int]
    ]
   :AlbumViewDetailed
   [:map
    ;; The unique identifier of the album.
    [:id {:optional true} :string]
    ;; The URI of the album.
    [:uri {:optional true} :string]
    ;; The title of the album.
    [:title {:optional true} :string]
    ;; The artist of the album.
    [:artist {:optional true} :string]
    ;; The URI of the album's artist.
    [:artistUri {:optional true} :string]
    ;; The year the album was released.
    [:year {:optional true} :int]
    ;; The URL of the album art image.
    [:albumArt {:optional true} :string]
    ;; The release date of the album.
    [:releaseDate {:optional true} :string]
    ;; The SHA256 hash of the album.
    [:sha256 {:optional true} :string]
    ;; The number of times the album has been played.
    [:playCount {:optional true} :int]
    ;; The number of unique listeners who have played the album.
    [:uniqueListeners {:optional true} :int]
    [:tags {:optional true} [:vector :string]]
    [:tracks {:optional true} [:vector :SongViewBasic]]
    ]
   :ApiKeyView
   [:map
    ;; The unique identifier of the API key.
    [:id {:optional true} :string]
    ;; The name of the API key.
    [:name {:optional true} :string]
    ;; A description for the API key.
    [:description {:optional true} :string]
    ;; The date and time when the API key was created.
    [:createdAt {:optional true} :string]
    ]
   :ArtistListenerViewBasic
   [:map
    ;; The unique identifier of the actor.
    [:id {:optional true} :string]
    ;; The DID of the listener.
    [:did {:optional true} :string]
    ;; The handle of the listener.
    [:handle {:optional true} :string]
    ;; The display name of the listener.
    [:displayName {:optional true} :string]
    ;; The URL of the listener's avatar image.
    [:avatar {:optional true} :string]
    [:mostListenedSong {:optional true} :ArtistSongViewBasic]
    ;; The total number of plays by the listener.
    [:totalPlays {:optional true} :int]
    ;; The rank of the listener among all listeners of the artist.
    [:rank {:optional true} :int]
    ]
   :ArtistMbid
   [:map
    ;; The MusicBrainz Identifier (MBID) of the artist.
    [:mbid {:optional true} :string]
    ;; The name of the artist.
    [:name {:optional true} :string]
    ]
   :ArtistRecentListenerView
   [:map
    ;; The unique identifier of the listener.
    [:id {:optional true} :string]
    ;; The DID of the listener.
    [:did {:optional true} :string]
    ;; The handle of the listener.
    [:handle {:optional true} :string]
    ;; The display name of the listener.
    [:displayName {:optional true} :string]
    ;; The URL of the listener's avatar image.
    [:avatar {:optional true} :string]
    ;; The timestamp of the listener's most recent scrobble of this artist.
    [:timestamp {:optional true} :string]
    ;; The URI of the listener's most recent scrobble of this artist.
    [:scrobbleUri {:optional true} :string]
    ]
   :ArtistRecord
   [:map
    ;; The name of the artist.
    [:name :string]
    ;; The biography of the artist.
    [:bio {:optional true} :string]
    ;; The picture of the artist.
    [:picture {:optional true} :BlobRef]
    ;; The URL of the picture of the artist.
    [:pictureUrl {:optional true} :string]
    ;; The tags of the artist.
    [:tags {:optional true} [:vector :string]]
    ;; The birth date of the artist.
    [:born {:optional true} :string]
    ;; The death date of the artist.
    [:died {:optional true} :string]
    ;; The birth place of the artist.
    [:bornIn {:optional true} :string]
    ;; The date when the artist was created.
    [:createdAt :string]
    ]
   :ArtistSongViewBasic
   [:map
    ;; The URI of the song.
    [:uri {:optional true} :string]
    ;; The title of the song.
    [:title {:optional true} :string]
    ;; The number of times the song has been played.
    [:playCount {:optional true} :int]
    ]
   :ArtistViewBasic
   [:map
    ;; The unique identifier of the artist.
    [:id {:optional true} :string]
    ;; The URI of the artist.
    [:uri {:optional true} :string]
    ;; The name of the artist.
    [:name {:optional true} :string]
    ;; The picture of the artist.
    [:picture {:optional true} :string]
    ;; The SHA256 hash of the artist.
    [:sha256 {:optional true} :string]
    ;; The number of times the artist has been played.
    [:playCount {:optional true} :int]
    ;; The number of unique listeners who have played the artist.
    [:uniqueListeners {:optional true} :int]
    [:tags {:optional true} [:vector :string]]
    ]
   :ArtistViewDetailed
   [:map
    ;; The unique identifier of the artist.
    [:id {:optional true} :string]
    ;; The URI of the artist.
    [:uri {:optional true} :string]
    ;; The name of the artist.
    [:name {:optional true} :string]
    ;; The picture of the artist.
    [:picture {:optional true} :string]
    ;; The SHA256 hash of the artist.
    [:sha256 {:optional true} :string]
    ;; The number of times the artist has been played.
    [:playCount {:optional true} :int]
    ;; The number of unique listeners who have played the artist.
    [:uniqueListeners {:optional true} :int]
    [:tags {:optional true} [:vector :string]]
    ]
   :AudioSettingsRecord
   [:map
    ;; Crossfade settings
    [:crossfade {:optional true} :RockboxCrossfadeSettings]
    ;; Equalizer settings
    [:equalizer {:optional true} :RockboxEqualizerSettings]
    ;; Replay gain settings
    [:replayGain {:optional true} :RockboxReplayGainSettings]
    ;; Tone control settings (bass, treble, balance, channels)
    [:tone {:optional true} :RockboxToneSettings]
    ;; When this settings record was first created.
    [:createdAt :string]
    ;; When this settings record was last updated.
    [:updatedAt {:optional true} :string]
    ]
   :ChartsScrobbleViewBasic
   [:map
    ;; The date of the scrobble.
    [:date {:optional true} :string]
    ;; The number of scrobbles on this date.
    [:count {:optional true} :int]
    ]
   :ChartsView
   [:map
    [:scrobbles {:optional true} [:vector :ChartsScrobbleViewBasic]]
    ]
   :CreateApikeyInput
   [:map
    ;; The name of the API key.
    [:name :string]
    ;; A description for the API key.
    [:description {:optional true} :string]
    ]
   :CreatePlaylistParams
   [:map
    ;; The name of the playlist
    [:name :string]
    ;; A brief description of the playlist
    [:description {:optional true} :string]
    ]
   :CreateScrobbleInput
   [:map
    ;; The title of the track being scrobbled
    [:title :string]
    ;; The artist of the track being scrobbled
    [:artist :string]
    ;; The album of the track being scrobbled
    [:album {:optional true} :string]
    ;; The duration of the track in milliseconds (e.g., 240000 for 4 minutes)
    [:duration {:optional true} :int]
    ;; The MusicBrainz ID of the track, if available
    [:mbId {:optional true} :string]
    ;; The International Standard Recording Code (ISRC) of the track, if available
    [:isrc {:optional true} :string]
    ;; The URL of the album art for the track
    [:albumArt {:optional true} :string]
    ;; The track number of the track in the album
    [:trackNumber {:optional true} :int]
    ;; The release date of the track, formatted as YYYY-MM-DD
    [:releaseDate {:optional true} :string]
    ;; The year the track was released
    [:year {:optional true} :int]
    ;; The disc number of the track in the album, if applicable
    [:discNumber {:optional true} :int]
    ;; The lyrics of the track, if available
    [:lyrics {:optional true} :string]
    ;; The composer of the track, if available
    [:composer {:optional true} :string]
    ;; The copyright message for the track, if available
    [:copyrightMessage {:optional true} :string]
    ;; The record label of the track, if available
    [:label {:optional true} :string]
    ;; The URL of the artist's picture, if available
    [:artistPicture {:optional true} :string]
    ;; The Spotify link for the track, if available
    [:spotifyLink {:optional true} :string]
    ;; The Last.fm link for the track, if available
    [:lastfmLink {:optional true} :string]
    ;; The Tidal link for the track, if available
    [:tidalLink {:optional true} :string]
    ;; The Apple Music link for the track, if available
    [:appleMusicLink {:optional true} :string]
    ;; The Youtube link for the track, if available
    [:youtubeLink {:optional true} :string]
    ;; The Deezer link for the track, if available
    [:deezerLink {:optional true} :string]
    ;; The timestamp of the scrobble in seconds since epoch (Unix timestamp)
    [:timestamp {:optional true} :int]
    ]
   :CreateShoutInput
   [:map
    ;; The content of the shout
    [:message {:optional true} :string]
    ]
   :CreateSongInput
   [:map
    ;; The title of the song
    [:title :string]
    ;; The artist of the song
    [:artist :string]
    ;; The album artist of the song, if different from the main artist
    [:albumArtist :string]
    ;; The album of the song, if applicable
    [:album :string]
    ;; The duration of the song in milliseconds
    [:duration {:optional true} :int]
    ;; The MusicBrainz ID of the song, if available
    [:mbId {:optional true} :string]
    ;; The International Standard Recording Code (ISRC) of the song, if available
    [:isrc {:optional true} :string]
    ;; The URL of the album art for the song
    [:albumArt {:optional true} :string]
    ;; The track number of the song in the album, if applicable
    [:trackNumber {:optional true} :int]
    ;; The release date of the song, formatted as YYYY-MM-DD
    [:releaseDate {:optional true} :string]
    ;; The year the song was released
    [:year {:optional true} :int]
    ;; The disc number of the song in the album, if applicable
    [:discNumber {:optional true} :int]
    ;; The lyrics of the song, if available
    [:lyrics {:optional true} :string]
    ]
   :DescribeFeedGeneratorOutput
   [:map
    ;; The DID of the feed generator.
    [:did {:optional true} :string]
    ;; List of feed URIs generated by this feed generator.
    [:feeds {:optional true} [:vector :FeedUriView]]
    ]
   :DescribeFeedGeneratorParams
   [:map]
   :DislikeShoutInput
   [:map
    ;; The unique identifier of the shout to dislike
    [:uri {:optional true} :string]
    ]
   :DislikeSongInput
   [:map
    ;; The unique identifier of the song to dislike
    [:uri {:optional true} :string]
    ]
   :DownloadFileParams
   [:map
    ;; The unique identifier of the file to download
    [:fileId :string]
    ]
   :DropboxFileListView
   [:map
    ;; A list of files in the Dropbox.
    [:files {:optional true} [:vector :DropboxFileView]]
    ]
   :DropboxFileView
   [:map
    ;; The unique identifier of the file.
    [:id {:optional true} :string]
    ;; The name of the file.
    [:name {:optional true} :string]
    ;; The lowercased path of the file.
    [:pathLower {:optional true} :string]
    ;; The display path of the file.
    [:pathDisplay {:optional true} :string]
    ;; The last modified date and time of the file on the client.
    [:clientModified {:optional true} :string]
    ;; The last modified date and time of the file on the server.
    [:serverModified {:optional true} :string]
    ]
   :DropboxTemporaryLinkView
   [:map
    ;; The temporary link to access the file.
    [:link {:optional true} :string]
    ]
   :FeedGeneratorsView
   [:map
    [:feeds {:optional true} [:vector :FeedGeneratorView]]
    ]
   :FeedGeneratorView
   [:map
    [:id {:optional true} :string]
    [:name {:optional true} :string]
    [:description {:optional true} :string]
    [:uri {:optional true} :string]
    [:avatar {:optional true} :string]
    [:creator {:optional true} :ActorProfileViewBasic]
    ]
   :FeedItemView
   [:map
    [:scrobble {:optional true} :ScrobbleViewBasic]
    ]
   :FeedRecommendationsView
   [:map
    [:recommendations {:optional true} [:vector :FeedRecommendationView]]
    [:cursor {:optional true} :string]
    ]
   :FeedRecommendationView
   [:map
    [:title {:optional true} :string]
    [:artist {:optional true} :string]
    [:album {:optional true} :string]
    [:albumArt {:optional true} :string]
    [:trackUri {:optional true} :string]
    [:artistUri {:optional true} :string]
    [:albumUri {:optional true} :string]
    [:genres {:optional true} [:vector :string]]
    [:recommendationScore {:optional true} :int]
    ;; neighbour | social | serendipity
    [:source {:optional true} :string]
    [:likesCount {:optional true} :int]
    ]
   :FeedRecommendedAlbumsView
   [:map
    [:albums {:optional true} [:vector :FeedRecommendedAlbumView]]
    [:cursor {:optional true} :string]
    ]
   :FeedRecommendedAlbumView
   [:map
    [:id {:optional true} :string]
    [:uri {:optional true} :string]
    [:title {:optional true} :string]
    [:artist {:optional true} :string]
    [:artistUri {:optional true} :string]
    [:year {:optional true} :int]
    [:albumArt {:optional true} :string]
    [:recommendationScore {:optional true} :int]
    ;; known-artist | new-artist | serendipity
    [:source {:optional true} :string]
    ]
   :FeedRecommendedArtistsView
   [:map
    [:artists {:optional true} [:vector :FeedRecommendedArtistView]]
    [:cursor {:optional true} :string]
    ]
   :FeedRecommendedArtistView
   [:map
    [:id {:optional true} :string]
    [:uri {:optional true} :string]
    [:name {:optional true} :string]
    [:picture {:optional true} :string]
    [:genres {:optional true} [:vector :string]]
    [:recommendationScore {:optional true} :int]
    ;; neighbour | social | serendipity
    [:source {:optional true} :string]
    ]
   :FeedSearchResultsView
   [:map
    [:hits {:optional true} [:vector [:or :SongViewBasic :AlbumViewBasic :ArtistViewBasic :PlaylistViewBasic :ActorProfileViewBasic]]]
    [:processingTimeMs {:optional true} :int]
    [:limit {:optional true} :int]
    [:offset {:optional true} :int]
    [:estimatedTotalHits {:optional true} :int]
    ]
   :FeedStoriesView
   [:map
    [:stories {:optional true} [:vector :FeedStoryView]]
    ]
   :FeedStoryView
   [:map
    [:album {:optional true} :string]
    [:albumArt {:optional true} :string]
    [:albumArtist {:optional true} :string]
    [:albumUri {:optional true} :string]
    [:artist {:optional true} :string]
    [:artistUri {:optional true} :string]
    [:avatar {:optional true} :string]
    [:createdAt {:optional true} :string]
    [:did {:optional true} :string]
    [:handle {:optional true} :string]
    [:id {:optional true} :string]
    [:title {:optional true} :string]
    [:trackId {:optional true} :string]
    [:trackUri {:optional true} :string]
    [:uri {:optional true} :string]
    ]
   :FeedUriView
   [:map
    ;; The feed URI.
    [:uri {:optional true} :string]
    ]
   :FeedView
   [:map
    [:feed {:optional true} [:vector :FeedItemView]]
    ;; The pagination cursor for the next set of results.
    [:cursor {:optional true} :string]
    ]
   :FollowAccountOutput
   [:map
    [:subject :ActorProfileViewBasic]
    [:followers [:vector :ActorProfileViewBasic]]
    ;; A cursor value to pass to subsequent calls to get the next page of results.
    [:cursor {:optional true} :string]
    ]
   :FollowAccountParams
   [:map
    [:account :string]
    ]
   :FollowRecord
   [:map
    [:createdAt :string]
    [:subject :string]
    [:via {:optional true} :StrongRef]
    ]
   :GeneratorRecord
   [:map
    [:did :string]
    [:avatar {:optional true} :BlobRef]
    [:displayName :string]
    [:description {:optional true} :string]
    [:createdAt :string]
    ]
   :GetActorAlbumsOutput
   [:map
    [:albums {:optional true} [:vector :AlbumViewBasic]]
    ]
   :GetActorAlbumsParams
   [:map
    ;; The DID or handle of the actor
    [:did :string]
    ;; The maximum number of albums to return
    [:limit {:optional true} :int]
    ;; The offset for pagination
    [:offset {:optional true} :int]
    ;; The start date to filter albums from (ISO 8601 format)
    [:startDate {:optional true} :string]
    ;; The end date to filter albums to (ISO 8601 format)
    [:endDate {:optional true} :string]
    ]
   :GetActorArtistsOutput
   [:map
    [:artists {:optional true} [:vector :ArtistViewBasic]]
    ]
   :GetActorArtistsParams
   [:map
    ;; The DID or handle of the actor
    [:did :string]
    ;; The maximum number of albums to return
    [:limit {:optional true} :int]
    ;; The offset for pagination
    [:offset {:optional true} :int]
    ;; The start date to filter albums from (ISO 8601 format)
    [:startDate {:optional true} :string]
    ;; The end date to filter albums to (ISO 8601 format)
    [:endDate {:optional true} :string]
    ]
   :GetActorCompatibilityOutput
   [:map
    [:compatibility {:optional true} :ActorCompatibilityViewBasic]
    ]
   :GetActorCompatibilityParams
   [:map
    ;; DID or handle to get compatibility for
    [:did :string]
    ]
   :GetActorLovedSongsOutput
   [:map
    [:tracks {:optional true} [:vector :SongViewBasic]]
    ]
   :GetActorLovedSongsParams
   [:map
    ;; The DID or handle of the actor
    [:did :string]
    ;; The maximum number of albums to return
    [:limit {:optional true} :int]
    ;; The offset for pagination
    [:offset {:optional true} :int]
    ]
   :GetActorNeighboursOutput
   [:map
    [:neighbours {:optional true} [:vector :ActorNeighbourViewBasic]]
    ]
   :GetActorNeighboursParams
   [:map
    ;; The DID or handle of the actor
    [:did :string]
    ]
   :GetActorPlaylistsOutput
   [:map
    [:playlists {:optional true} [:vector :PlaylistViewBasic]]
    ]
   :GetActorPlaylistsParams
   [:map
    ;; The DID or handle of the actor
    [:did :string]
    ;; The maximum number of albums to return
    [:limit {:optional true} :int]
    ;; The offset for pagination
    [:offset {:optional true} :int]
    ]
   :GetActorScrobblesOutput
   [:map
    [:scrobbles {:optional true} [:vector :ScrobbleViewBasic]]
    ]
   :GetActorScrobblesParams
   [:map
    ;; The DID or handle of the actor
    [:did :string]
    ;; The maximum number of albums to return
    [:limit {:optional true} :int]
    ;; The offset for pagination
    [:offset {:optional true} :int]
    ]
   :GetActorSongsOutput
   [:map
    [:songs {:optional true} [:vector :SongViewBasic]]
    ]
   :GetActorSongsParams
   [:map
    ;; The DID or handle of the actor
    [:did :string]
    ;; The maximum number of albums to return
    [:limit {:optional true} :int]
    ;; The offset for pagination
    [:offset {:optional true} :int]
    ;; The start date to filter albums from (ISO 8601 format)
    [:startDate {:optional true} :string]
    ;; The end date to filter albums to (ISO 8601 format)
    [:endDate {:optional true} :string]
    ]
   :GetAlbumParams
   [:map
    ;; The URI of the album to retrieve.
    [:uri :string]
    ]
   :GetAlbumRecommendationsParams
   [:map
    ;; DID or handle of the user to recommend for.
    [:did :string]
    [:limit {:optional true} :int]
    ]
   :GetAlbumShoutsOutput
   [:map
    [:shouts {:optional true} [:vector :any]]
    ]
   :GetAlbumShoutsParams
   [:map
    ;; The unique identifier of the album to retrieve shouts for
    [:uri :string]
    ;; The maximum number of shouts to return
    [:limit {:optional true} :int]
    ;; The number of shouts to skip before starting to collect the result set
    [:offset {:optional true} :int]
    ]
   :GetAlbumsOutput
   [:map
    [:albums {:optional true} [:vector :AlbumViewBasic]]
    ]
   :GetAlbumsParams
   [:map
    ;; The maximum number of albums to return
    [:limit {:optional true} :int]
    ;; The offset for pagination
    [:offset {:optional true} :int]
    ;; The genre to filter artists by
    [:genre {:optional true} :string]
    ]
   :GetAlbumTracksOutput
   [:map
    [:tracks {:optional true} [:vector :SongViewBasic]]
    ]
   :GetAlbumTracksParams
   [:map
    ;; The URI of the album to retrieve tracks from
    [:uri :string]
    ]
   :GetApikeysOutput
   [:map
    [:apiKeys {:optional true} [:vector :any]]
    ]
   :GetApikeysParams
   [:map
    ;; The number of API keys to skip before starting to collect the result set.
    [:offset {:optional true} :int]
    ;; The number of API keys to return per page.
    [:limit {:optional true} :int]
    ]
   :GetArtistAlbumsOutput
   [:map
    [:albums {:optional true} [:vector :AlbumViewBasic]]
    ]
   :GetArtistAlbumsParams
   [:map
    ;; The URI of the artist to retrieve albums from
    [:uri :string]
    ]
   :GetArtistListenersOutput
   [:map
    [:listeners {:optional true} [:vector :ArtistListenerViewBasic]]
    ]
   :GetArtistListenersParams
   [:map
    ;; The URI of the artist to retrieve listeners from
    [:uri :string]
    ;; Number of items to skip before returning results
    [:offset {:optional true} :int]
    ;; Maximum number of results to return
    [:limit {:optional true} :int]
    ]
   :GetArtistParams
   [:map
    ;; The URI of the artist to retrieve details from
    [:uri :string]
    ]
   :GetArtistRecentListenersOutput
   [:map
    [:listeners {:optional true} [:vector :ArtistRecentListenerView]]
    ]
   :GetArtistRecentListenersParams
   [:map
    ;; The URI of the artist to retrieve recent listeners from
    [:uri :string]
    ;; Number of items to skip before returning results
    [:offset {:optional true} :int]
    ;; Maximum number of results to return
    [:limit {:optional true} :int]
    ]
   :GetArtistRecommendationsParams
   [:map
    ;; DID or handle of the user to recommend for.
    [:did :string]
    [:limit {:optional true} :int]
    ]
   :GetArtistShoutsOutput
   [:map
    [:shouts {:optional true} [:vector :any]]
    ]
   :GetArtistShoutsParams
   [:map
    ;; The URI of the artist to retrieve shouts for
    [:uri :string]
    ;; The maximum number of shouts to return
    [:limit {:optional true} :int]
    ;; The number of shouts to skip before starting to collect the result set
    [:offset {:optional true} :int]
    ]
   :GetArtistsOutput
   [:map
    [:artists {:optional true} [:vector :ArtistViewBasic]]
    ]
   :GetArtistsParams
   [:map
    ;; The maximum number of artists to return
    [:limit {:optional true} :int]
    ;; The offset for pagination
    [:offset {:optional true} :int]
    ;; The names of the artists to return
    [:names {:optional true} :string]
    ;; The genre to filter artists by
    [:genre {:optional true} :string]
    ]
   :GetArtistTracksOutput
   [:map
    [:tracks {:optional true} [:vector :SongViewBasic]]
    ]
   :GetArtistTracksParams
   [:map
    ;; The URI of the artist to retrieve albums from
    [:uri {:optional true} :string]
    ;; The maximum number of tracks to return
    [:limit {:optional true} :int]
    ;; The offset for pagination
    [:offset {:optional true} :int]
    ]
   :GetAudioSettingsParams
   [:map
    ;; DID or handle of the user whose settings to fetch. Required for unauthenticated requests.
    [:did {:optional true} :string]
    ]
   :GetCurrentlyPlayingParams
   [:map
    [:playerId {:optional true} :string]
    ;; Handle or DID of the actor to retrieve the currently playing track for. If not provided, defaults to the current user.
    [:actor {:optional true} :string]
    ]
   :GetFeedGeneratorOutput
   [:map
    [:view {:optional true} :FeedGeneratorView]
    ]
   :GetFeedGeneratorParams
   [:map
    ;; AT-URI of the feed generator record.
    [:feed :string]
    ]
   :GetFeedGeneratorsParams
   [:map
    ;; The maximum number of feed generators to return.
    [:size {:optional true} :int]
    ]
   :GetFeedParams
   [:map
    ;; The feed URI.
    [:feed :string]
    ;; The maximum number of scrobbles to return
    [:limit {:optional true} :int]
    ;; The cursor for pagination
    [:cursor {:optional true} :string]
    ]
   :GetFeedSkeletonOutput
   [:map
    [:scrobbles {:optional true} [:vector :ScrobbleViewBasic]]
    ;; The pagination cursor for the next set of results.
    [:cursor {:optional true} :string]
    ]
   :GetFeedSkeletonParams
   [:map
    ;; The feed URI.
    [:feed :string]
    ;; The maximum number of scrobbles to return
    [:limit {:optional true} :int]
    ;; The offset for pagination
    [:offset {:optional true} :int]
    ;; The pagination cursor.
    [:cursor {:optional true} :string]
    ]
   :GetFileParams
   [:map
    ;; The unique identifier of the file to retrieve
    [:fileId :string]
    ]
   :GetFilesParams
   [:map
    ;; Path to the Dropbox folder or root directory
    [:at {:optional true} :string]
    ]
   :GetFollowersOutput
   [:map
    [:subject :ActorProfileViewBasic]
    [:followers [:vector :ActorProfileViewBasic]]
    ;; A cursor value to pass to subsequent calls to get the next page of results.
    [:cursor {:optional true} :string]
    ;; The total number of followers.
    [:count {:optional true} :int]
    ]
   :GetFollowersParams
   [:map
    [:actor :string]
    [:limit {:optional true} :int]
    ;; If provided, filters the followers to only include those with DIDs in this list.
    [:dids {:optional true} [:vector :string]]
    [:cursor {:optional true} :string]
    ]
   :GetFollowsOutput
   [:map
    [:subject :ActorProfileViewBasic]
    [:follows [:vector :ActorProfileViewBasic]]
    ;; A cursor value to pass to subsequent calls to get the next page of results.
    [:cursor {:optional true} :string]
    ;; The total number of follows.
    [:count {:optional true} :int]
    ]
   :GetFollowsParams
   [:map
    [:actor :string]
    [:limit {:optional true} :int]
    ;; If provided, filters the follows to only include those with DIDs in this list.
    [:dids {:optional true} [:vector :string]]
    [:cursor {:optional true} :string]
    ]
   :GetGlobalStatsParams
   [:map]
   :GetKnownFollowersOutput
   [:map
    [:subject :ActorProfileViewBasic]
    [:followers [:vector :ActorProfileViewBasic]]
    ;; A cursor value to pass to subsequent calls to get the next page of results.
    [:cursor {:optional true} :string]
    ]
   :GetKnownFollowersParams
   [:map
    [:actor :string]
    [:limit {:optional true} :int]
    [:cursor {:optional true} :string]
    ]
   :GetMetadataParams
   [:map
    ;; Path to the file or folder in Dropbox
    [:path :string]
    ]
   :GetMirrorSourcesOutput
   [:map
    [:sources [:vector :MirrorSourceView]]
    ]
   :GetMirrorSourcesParams
   [:map]
   :GetPlaybackQueueParams
   [:map
    [:playerId {:optional true} :string]
    ]
   :GetPlaylistParams
   [:map
    ;; The URI of the playlist to retrieve.
    [:uri :string]
    ]
   :GetPlaylistsOutput
   [:map
    [:playlists {:optional true} [:vector :PlaylistViewBasic]]
    ]
   :GetPlaylistsParams
   [:map
    ;; The maximum number of playlists to return.
    [:limit {:optional true} :int]
    ;; The offset for pagination, used to skip a number of playlists.
    [:offset {:optional true} :int]
    ]
   :GetProfileParams
   [:map
    ;; The DID or handle of the actor
    [:did {:optional true} :string]
    ]
   :GetProfileShoutsOutput
   [:map
    [:shouts {:optional true} [:vector :any]]
    ]
   :GetProfileShoutsParams
   [:map
    ;; The DID or handle of the actor
    [:did :string]
    ;; The offset for pagination
    [:offset {:optional true} :int]
    ;; The maximum number of shouts to return
    [:limit {:optional true} :int]
    ]
   :GetRecommendationsParams
   [:map
    ;; DID or handle of the user to recommend for.
    [:did :string]
    [:limit {:optional true} :int]
    ]
   :GetScrobbleParams
   [:map
    ;; The unique identifier of the scrobble
    [:uri :string]
    ]
   :GetScrobblesChartParams
   [:map
    ;; The DID or handle of the actor
    [:did {:optional true} :string]
    ;; The URI of the artist to filter by
    [:artisturi {:optional true} :string]
    ;; The URI of the album to filter by
    [:albumuri {:optional true} :string]
    ;; The URI of the track to filter by
    [:songuri {:optional true} :string]
    ;; The genre to filter by
    [:genre {:optional true} :string]
    ;; Start date (ISO 8601). Defaults to 6 months ago.
    [:from {:optional true} :string]
    ;; End date (ISO 8601). Defaults to today.
    [:to {:optional true} :string]
    ]
   :GetScrobblesOutput
   [:map
    [:scrobbles {:optional true} [:vector :ScrobbleViewBasic]]
    ]
   :GetScrobblesParams
   [:map
    ;; The DID or handle of the actor
    [:did {:optional true} :string]
    ;; If true, only return scrobbles from actors the viewer is following.
    [:following {:optional true} :boolean]
    ;; The maximum number of scrobbles to return
    [:limit {:optional true} :int]
    ;; The offset for pagination
    [:offset {:optional true} :int]
    ]
   :GetShoutRepliesOutput
   [:map
    [:shouts {:optional true} [:vector :any]]
    ]
   :GetShoutRepliesParams
   [:map
    ;; The URI of the shout to retrieve replies for
    [:uri :string]
    ;; The maximum number of shouts to return
    [:limit {:optional true} :int]
    ;; The number of shouts to skip before starting to collect the result set
    [:offset {:optional true} :int]
    ]
   :GetSongParams
   [:map
    ;; The AT-URI of the song to retrieve
    [:uri {:optional true} :string]
    ;; The MusicBrainz ID of the song to retrieve
    [:mbid {:optional true} :string]
    ;; The International Standard Recording Code (ISRC) of the song to retrieve
    [:isrc {:optional true} :string]
    ;; The Spotify track ID of the song to retrieve (resolved internally to the Spotify track URL)
    [:spotifyId {:optional true} :string]
    ]
   :GetSongRecentListenersOutput
   [:map
    [:listeners {:optional true} [:vector :SongRecentListenerView]]
    ]
   :GetSongRecentListenersParams
   [:map
    ;; The URI of the song to retrieve recent listeners from
    [:uri :string]
    ;; Number of items to skip before returning results
    [:offset {:optional true} :int]
    ;; Maximum number of results to return
    [:limit {:optional true} :int]
    ]
   :GetSongsOutput
   [:map
    [:songs {:optional true} [:vector :SongViewBasic]]
    ]
   :GetSongsParams
   [:map
    ;; The maximum number of songs to return
    [:limit {:optional true} :int]
    ;; The offset for pagination
    [:offset {:optional true} :int]
    ;; The genre to filter artists by
    [:genre {:optional true} :string]
    ;; Filter songs by MusicBrainz ID
    [:mbid {:optional true} :string]
    ;; Filter songs by International Standard Recording Code (ISRC)
    [:isrc {:optional true} :string]
    ;; Filter songs by Spotify track ID (resolved internally to the Spotify track URL)
    [:spotifyId {:optional true} :string]
    ]
   :GetStatsParams
   [:map
    ;; The DID or handle of the user to get stats for.
    [:did :string]
    ]
   :GetStoriesParams
   [:map
    ;; The maximum number of stories to return.
    [:size {:optional true} :int]
    ;; The feed URI to filter stories by.
    [:feed {:optional true} :string]
    ;; If true, only return stories from users the viewer follows. Requires authentication.
    [:following {:optional true} :boolean]
    ]
   :GetTemporaryLinkParams
   [:map
    ;; Path to the file in Dropbox
    [:path :string]
    ]
   :GetTopArtistsOutput
   [:map
    [:artists {:optional true} [:vector :ArtistViewBasic]]
    ]
   :GetTopArtistsParams
   [:map
    ;; The maximum number of artists to return
    [:limit {:optional true} :int]
    ;; The offset for pagination
    [:offset {:optional true} :int]
    ;; The start date to filter artists from (ISO 8601 format)
    [:startDate {:optional true} :string]
    ;; The end date to filter artists to (ISO 8601 format)
    [:endDate {:optional true} :string]
    ]
   :GetTopTracksOutput
   [:map
    [:tracks {:optional true} [:vector :SongViewBasic]]
    ]
   :GetTopTracksParams
   [:map
    ;; The maximum number of tracks to return
    [:limit {:optional true} :int]
    ;; The offset for pagination
    [:offset {:optional true} :int]
    ;; The start date to filter tracks from (ISO 8601 format)
    [:startDate {:optional true} :string]
    ;; The end date to filter tracks to (ISO 8601 format)
    [:endDate {:optional true} :string]
    ]
   :GetTrackShoutsOutput
   [:map
    [:shouts {:optional true} [:vector :any]]
    ]
   :GetTrackShoutsParams
   [:map
    ;; The URI of the track to retrieve shouts for
    [:uri :string]
    ]
   :GetWrappedParams
   [:map
    ;; The DID or handle of the user
    [:did :string]
    ;; The year to get wrapped stats for (defaults to current year)
    [:year {:optional true} :int]
    ]
   :GoogledriveFileListView
   [:map
    [:files {:optional true} [:vector :GoogledriveFileView]]
    ]
   :GoogledriveFileView
   [:map
    ;; The unique identifier of the file.
    [:id {:optional true} :string]
    ]
   ;; indicates that a handle or DID could not be resolved
   :GraphNotFoundActor
   [:map
    [:actor :string]
    [:notFound :boolean]
    ]
   :GraphRelationship
   [:map
    [:did :string]
    ;; if the actor follows this DID, this is the AT-URI of the follow record
    [:following {:optional true} :string]
    ;; if the actor is followed by this DID, contains the AT-URI of the follow record
    [:followedBy {:optional true} :string]
    ]
   :InsertDirectoryParams
   [:map
    ;; The URI of the playlist to start
    [:uri :string]
    ;; The directory (id) to insert into the playlist
    [:directory :string]
    ;; The position in the playlist to insert the directory at, if not specified, the directory will be appended
    [:position {:optional true} :int]
    ]
   :InsertFilesParams
   [:map
    ;; The URI of the playlist to start
    [:uri :string]
    [:files [:vector :string]]
    ;; The position in the playlist to insert the files at, if not specified, files will be appended
    [:position {:optional true} :int]
    ]
   :LikeRecord
   [:map
    ;; The date when the like was created.
    [:createdAt :string]
    [:subject :StrongRef]
    ]
   :LikeShoutInput
   [:map
    ;; The unique identifier of the shout to like
    [:uri {:optional true} :string]
    ]
   :LikeSongInput
   [:map
    ;; The unique identifier of the song to like
    [:uri {:optional true} :string]
    ]
   :MatchSongParams
   [:map
    ;; The title of the song to retrieve
    [:title :string]
    ;; The artist of the song to retrieve
    [:artist :string]
    ;; Optional MusicBrainz recording ID to anchor the match
    [:mbId {:optional true} :string]
    ;; Optional International Standard Recording Code (ISRC) to anchor the match
    [:isrc {:optional true} :string]
    ]
   :MirrorSourceView
   [:map
    ;; One of: lastfm, listenbrainz, tealfm
    [:provider :string]
    ;; Whether scrobbles from this source are being mirrored into Rocksky.
    [:enabled :boolean]
    ;; Username on the external service (Last.fm / ListenBrainz). Null for Teal.fm.
    [:externalUsername {:optional true} :string]
    ;; True when an API key is stored. Last.fm/ListenBrainz only; always false for Teal.fm.
    [:hasCredentials :boolean]
    ;; The last time the mirror process successfully polled this source.
    [:lastPolledAt {:optional true} :string]
    ;; Watermark — scrobbles from the external service older than this are skipped.
    [:lastScrobbleSeenAt {:optional true} :string]
    ]
   :NextParams
   [:map
    [:playerId {:optional true} :string]
    ]
   :PauseParams
   [:map
    [:playerId {:optional true} :string]
    ]
   :PlayDirectoryParams
   [:map
    [:playerId {:optional true} :string]
    [:directoryId :string]
    [:shuffle {:optional true} :boolean]
    [:recurse {:optional true} :boolean]
    [:position {:optional true} :int]
    ]
   :PlayerCurrentlyPlayingViewDetailed
   [:map
    ;; The title of the currently playing track
    [:title {:optional true} :string]
    ]
   :PlayerPlaybackQueueViewDetailed
   [:map
    [:tracks {:optional true} [:vector :SongViewBasic]]
    ]
   :PlayFileParams
   [:map
    [:playerId {:optional true} :string]
    [:fileId :string]
    ]
   :PlaylistItemRecord
   [:map
    [:subject :StrongRef]
    ;; The date the playlist was created.
    [:createdAt :string]
    [:track :SongViewBasic]
    ;; The order of the item in the playlist.
    [:order :int]
    ]
   :PlaylistRecord
   [:map
    ;; The name of the playlist.
    [:name :string]
    ;; The playlist description.
    [:description {:optional true} :string]
    ;; The picture of the playlist.
    [:picture {:optional true} :BlobRef]
    ;; The URL of the picture of the artist.
    [:pictureUrl {:optional true} :string]
    ;; The date the playlist was created.
    [:createdAt :string]
    ;; The Spotify link of the playlist.
    [:spotifyLink {:optional true} :string]
    ;; The Tidal link of the playlist.
    [:tidalLink {:optional true} :string]
    ;; The YouTube link of the playlist.
    [:youtubeLink {:optional true} :string]
    ;; The Apple Music link of the playlist.
    [:appleMusicLink {:optional true} :string]
    ]
   ;; Basic view of a playlist, including its metadata
   :PlaylistViewBasic
   [:map
    ;; The unique identifier of the playlist.
    [:id {:optional true} :string]
    ;; The title of the playlist.
    [:title {:optional true} :string]
    ;; The URI of the playlist.
    [:uri {:optional true} :string]
    ;; The DID of the curator of the playlist.
    [:curatorDid {:optional true} :string]
    ;; The handle of the curator of the playlist.
    [:curatorHandle {:optional true} :string]
    ;; The name of the curator of the playlist.
    [:curatorName {:optional true} :string]
    ;; The URL of the avatar image of the curator.
    [:curatorAvatarUrl {:optional true} :string]
    ;; A description of the playlist.
    [:description {:optional true} :string]
    ;; The URL of the cover image for the playlist.
    [:coverImageUrl {:optional true} :string]
    ;; The date and time when the playlist was created.
    [:createdAt {:optional true} :string]
    ;; The number of tracks in the playlist.
    [:trackCount {:optional true} :int]
    ]
   ;; Detailed view of a playlist, including its tracks and metadata
   :PlaylistViewDetailed
   [:map
    ;; The unique identifier of the playlist.
    [:id {:optional true} :string]
    ;; The title of the playlist.
    [:title {:optional true} :string]
    ;; The URI of the playlist.
    [:uri {:optional true} :string]
    ;; The DID of the curator of the playlist.
    [:curatorDid {:optional true} :string]
    ;; The handle of the curator of the playlist.
    [:curatorHandle {:optional true} :string]
    ;; The name of the curator of the playlist.
    [:curatorName {:optional true} :string]
    ;; The URL of the avatar image of the curator.
    [:curatorAvatarUrl {:optional true} :string]
    ;; A description of the playlist.
    [:description {:optional true} :string]
    ;; The URL of the cover image for the playlist.
    [:coverImageUrl {:optional true} :string]
    ;; The date and time when the playlist was created.
    [:createdAt {:optional true} :string]
    ;; A list of tracks in the playlist.
    [:tracks {:optional true} [:vector :SongViewBasic]]
    ]
   :PlayParams
   [:map
    [:playerId {:optional true} :string]
    ]
   :PreviousParams
   [:map
    [:playerId {:optional true} :string]
    ]
   :ProfileRecord
   [:map
    [:displayName {:optional true} :string]
    ;; Free-form profile description text.
    [:description {:optional true} :string]
    ;; Small image to be displayed next to posts from account. AKA, 'profile picture'
    [:avatar {:optional true} :BlobRef]
    ;; Larger horizontal image to display behind profile view.
    [:banner {:optional true} :BlobRef]
    ;; Self-label values, specific to the Bluesky application, on the overall account.
    [:labels {:optional true} [:or :any]]
    [:joinedViaStarterPack {:optional true} :StrongRef]
    [:createdAt {:optional true} :string]
    ]
   :PutAudioSettingsInput
   [:map
    ;; Crossfade settings to apply.
    [:crossfade {:optional true} :RockboxCrossfadeSettings]
    ;; Equalizer settings to apply.
    [:equalizer {:optional true} :RockboxEqualizerSettings]
    ;; Replay gain settings to apply.
    [:replayGain {:optional true} :RockboxReplayGainSettings]
    ;; Tone control settings to apply.
    [:tone {:optional true} :RockboxToneSettings]
    ]
   :PutMirrorSourceInput
   [:map
    ;; One of: lastfm, listenbrainz, tealfm
    [:provider :string]
    ;; Enable or disable mirroring for this provider.
    [:enabled {:optional true} :boolean]
    ;; External username (Last.fm / ListenBrainz). Required when enabling those providers. Ignored for Teal.fm.
    [:externalUsername {:optional true} :string]
    ;; API key / token to be encrypted at rest. Omit to leave the existing key unchanged. Pass an empty string to clear it.
    [:apiKey {:optional true} :string]
    ]
   :RadioRecord
   [:map
    ;; The name of the radio station.
    [:name :string]
    ;; The URL of the radio station.
    [:url :string]
    ;; A description of the radio station.
    [:description {:optional true} :string]
    ;; The genre of the radio station.
    [:genre {:optional true} :string]
    ;; The logo of the radio station.
    [:logo {:optional true} :BlobRef]
    ;; The website of the radio station.
    [:website {:optional true} :string]
    ;; The date when the radio station was created.
    [:createdAt :string]
    ]
   :RadioViewBasic
   [:map
    ;; The unique identifier of the radio.
    [:id {:optional true} :string]
    ;; The name of the radio.
    [:name {:optional true} :string]
    ;; A brief description of the radio.
    [:description {:optional true} :string]
    ;; The date and time when the radio was created.
    [:createdAt {:optional true} :string]
    ]
   :RadioViewDetailed
   [:map
    ;; The unique identifier of the radio.
    [:id {:optional true} :string]
    ;; The name of the radio.
    [:name {:optional true} :string]
    ;; A brief description of the radio.
    [:description {:optional true} :string]
    ;; The website of the radio.
    [:website {:optional true} :string]
    ;; The streaming URL of the radio.
    [:url {:optional true} :string]
    ;; The genre of the radio.
    [:genre {:optional true} :string]
    ;; The logo of the radio station.
    [:logo {:optional true} :string]
    ;; The date and time when the radio was created.
    [:createdAt {:optional true} :string]
    ]
   :RemoveApikeyParams
   [:map
    ;; The ID of the API key to remove.
    [:id :string]
    ]
   :RemovePlaylistParams
   [:map
    ;; The URI of the playlist to remove
    [:uri :string]
    ]
   :RemoveShoutParams
   [:map
    ;; The ID of the shout to be removed
    [:id :string]
    ]
   :RemoveTrackParams
   [:map
    ;; The URI of the playlist to remove the track from
    [:uri :string]
    ;; The position of the track to remove in the playlist
    [:position :int]
    ]
   :ReplyShoutInput
   [:map
    ;; The unique identifier of the shout to reply to
    [:shoutId :string]
    ;; The content of the reply
    [:message :string]
    ]
   :ReportShoutInput
   [:map
    ;; The unique identifier of the shout to report
    [:shoutId :string]
    ;; The reason for reporting the shout
    [:reason {:optional true} :string]
    ]
   :RockboxCrossfadeSettings
   [:map
    ;; Crossfade mode: disabled | enabled | shuffle | albumChange | trackChange
    [:mode {:optional true} :string]
    ;; Fade-in delay in ms
    [:fadeInDelay {:optional true} :int]
    ;; Fade-in duration in ms
    [:fadeInDuration {:optional true} :int]
    ;; Fade-out delay in ms
    [:fadeOutDelay {:optional true} :int]
    ;; Fade-out duration in ms
    [:fadeOutDuration {:optional true} :int]
    ;; Fade-out mix mode: crossfade | mix
    [:fadeOutMixMode {:optional true} :string]
    ]
   :RockboxEqualizerBand
   [:map
    ;; Center frequency in Hz
    [:frequency :int]
    ;; Band gain in tenths of dB (e.g. 30 = +3.0 dB)
    [:gain :int]
    ;; Q factor × 10 (e.g. 7 = Q 0.7)
    [:q :int]
    ]
   :RockboxEqualizerSettings
   [:map
    ;; Whether the equalizer is enabled
    [:enabled {:optional true} :boolean]
    ;; Pre-amplification cut in tenths of dB applied before EQ bands (e.g. -60 = -6.0 dB)
    [:precut {:optional true} :int]
    ;; Up to 10 EQ bands
    [:bands {:optional true} [:vector :RockboxEqualizerBand]]
    ]
   :RockboxReplayGainSettings
   [:map
    ;; Replay gain mode: disabled | track | album | trackIfShuffling
    [:mode {:optional true} :string]
    ;; Pre-amplification in tenths of dB (e.g. 15 = +1.5 dB)
    [:preamp {:optional true} :int]
    ;; Whether to prevent clipping by reducing volume
    [:preventClipping {:optional true} :boolean]
    ]
   :RockboxSettingsView
   [:map
    ;; Crossfade settings
    [:crossfade {:optional true} :RockboxCrossfadeSettings]
    ;; Equalizer settings
    [:equalizer {:optional true} :RockboxEqualizerSettings]
    ;; Replay gain settings
    [:replayGain {:optional true} :RockboxReplayGainSettings]
    ;; Tone control settings (bass, treble, balance, channels)
    [:tone {:optional true} :RockboxToneSettings]
    ;; When this settings record was first created.
    [:createdAt :string]
    ;; When this settings record was last updated.
    [:updatedAt {:optional true} :string]
    ]
   :RockboxToneSettings
   [:map
    ;; Bass level in dB
    [:bass {:optional true} :int]
    ;; Treble level in dB
    [:treble {:optional true} :int]
    ;; Left/right balance. Negative = left, positive = right
    [:balance {:optional true} :int]
    ;; Channel configuration: stereo | mono | monoLeft | monoRight | karaoke | wide
    [:channels {:optional true} :string]
    ]
   :ScrobbleFirstScrobbleView
   [:map
    ;; The handle of the user who first scrobbled this song.
    [:handle {:optional true} :string]
    ;; The avatar URL of the user who first scrobbled this song.
    [:avatar {:optional true} :string]
    ;; The timestamp of the first scrobble.
    [:timestamp {:optional true} :string]
    ]
   :ScrobbleRecord
   [:map
    ;; The title of the song.
    [:title :string]
    ;; The artist of the song.
    [:artist :string]
    ;; The artists of the song with MusicBrainz IDs.
    [:artists {:optional true} [:vector :ArtistMbid]]
    ;; The album artist of the song.
    [:albumArtist :string]
    ;; The album of the song.
    [:album :string]
    ;; The duration of the song in milliseconds.
    [:duration :int]
    ;; The track number of the song in the album.
    [:trackNumber {:optional true} :int]
    ;; The disc number of the song in the album.
    [:discNumber {:optional true} :int]
    ;; The release date of the song.
    [:releaseDate {:optional true} :string]
    ;; The year the song was released.
    [:year {:optional true} :int]
    ;; The genre of the song.
    [:genre {:optional true} :string]
    ;; The tags of the song.
    [:tags {:optional true} [:vector :string]]
    ;; The composer of the song.
    [:composer {:optional true} :string]
    ;; The lyrics of the song.
    [:lyrics {:optional true} :string]
    ;; The copyright message of the song.
    [:copyrightMessage {:optional true} :string]
    ;; Informations about the song
    [:wiki {:optional true} :string]
    ;; The album art of the song.
    [:albumArt {:optional true} :BlobRef]
    ;; The URL of the album art of the song.
    [:albumArtUrl {:optional true} :string]
    ;; The YouTube link of the song.
    [:youtubeLink {:optional true} :string]
    ;; The Spotify link of the song.
    [:spotifyLink {:optional true} :string]
    ;; The Tidal link of the song.
    [:tidalLink {:optional true} :string]
    ;; The Apple Music link of the song.
    [:appleMusicLink {:optional true} :string]
    ;; The date when the song was created.
    [:createdAt :string]
    ;; The MusicBrainz ID of the song.
    [:mbid {:optional true} :string]
    ;; The label of the song.
    [:label {:optional true} :string]
    ;; The International Standard Recording Code (ISRC) of the song.
    [:isrc {:optional true} :string]
    ]
   :ScrobbleViewBasic
   [:map
    ;; The unique identifier of the scrobble.
    [:id {:optional true} :string]
    ;; The handle of the user who created the scrobble.
    [:user {:optional true} :string]
    ;; The display name of the user who created the scrobble.
    [:userDisplayName {:optional true} :string]
    ;; The avatar URL of the user who created the scrobble.
    [:userAvatar {:optional true} :string]
    ;; The title of the scrobble.
    [:title {:optional true} :string]
    ;; The artist of the song.
    [:artist {:optional true} :string]
    ;; The URI of the artist.
    [:artistUri {:optional true} :string]
    ;; The album of the song.
    [:album {:optional true} :string]
    ;; The URI of the album.
    [:albumUri {:optional true} :string]
    ;; The album art URL of the song.
    [:cover {:optional true} :string]
    ;; The timestamp when the scrobble was created.
    [:date {:optional true} :string]
    ;; The URI of the scrobble.
    [:uri {:optional true} :string]
    ;; The SHA256 hash of the scrobble data.
    [:sha256 {:optional true} :string]
    [:liked {:optional true} :boolean]
    [:likesCount {:optional true} :int]
    ]
   :ScrobbleViewDetailed
   [:map
    ;; The unique identifier of the scrobble.
    [:id {:optional true} :string]
    ;; The handle of the user who created the scrobble.
    [:user {:optional true} :string]
    ;; The title of the scrobble.
    [:title {:optional true} :string]
    ;; The artist of the song.
    [:artist {:optional true} :string]
    ;; The URI of the artist.
    [:artistUri {:optional true} :string]
    ;; The album of the song.
    [:album {:optional true} :string]
    ;; The URI of the album.
    [:albumUri {:optional true} :string]
    ;; The album art URL of the song.
    [:cover {:optional true} :string]
    ;; The timestamp when the scrobble was created.
    [:date {:optional true} :string]
    ;; The URI of the scrobble.
    [:uri {:optional true} :string]
    ;; The SHA256 hash of the scrobble data.
    [:sha256 {:optional true} :string]
    [:liked {:optional true} :boolean]
    [:likesCount {:optional true} :int]
    ;; The number of listeners
    [:listeners {:optional true} :int]
    ;; The number of scrobbles for this song
    [:scrobbles {:optional true} :int]
    [:artists {:optional true} [:vector :ArtistViewBasic]]
    ;; The first scrobble of this song on Rocksky.
    [:firstScrobble {:optional true} :ScrobbleFirstScrobbleView]
    ]
   :SearchParams
   [:map
    ;; The search query string
    [:query :string]
    ]
   :SeekParams
   [:map
    [:playerId {:optional true} :string]
    ;; The position in seconds to seek to
    [:position :int]
    ]
   :ShoutAuthor
   [:map
    ;; The unique identifier of the author.
    [:id {:optional true} :string]
    ;; The decentralized identifier (DID) of the author.
    [:did {:optional true} :string]
    ;; The handle of the author.
    [:handle {:optional true} :string]
    ;; The display name of the author.
    [:displayName {:optional true} :string]
    ;; The URL of the author's avatar image.
    [:avatar {:optional true} :string]
    ]
   :ShoutRecord
   [:map
    ;; The message of the shout.
    [:message :string]
    ;; The date when the shout was created.
    [:createdAt :string]
    [:parent {:optional true} :StrongRef]
    [:subject :StrongRef]
    ]
   :ShoutView
   [:map
    ;; The unique identifier of the shout.
    [:id {:optional true} :string]
    ;; The content of the shout.
    [:message {:optional true} :string]
    ;; The ID of the parent shout if this is a reply, otherwise null.
    [:parent {:optional true} :string]
    ;; The date and time when the shout was created.
    [:createdAt {:optional true} :string]
    ;; The author of the shout.
    [:author {:optional true} :ShoutAuthor]
    ]
   :SongFirstScrobbleView
   [:map
    ;; The handle of the user who first scrobbled this song.
    [:handle {:optional true} :string]
    ;; The avatar URL of the user who first scrobbled this song.
    [:avatar {:optional true} :string]
    ;; The timestamp of the first scrobble.
    [:timestamp {:optional true} :string]
    ]
   :SongRecentListenerView
   [:map
    ;; The unique identifier of the listener.
    [:id {:optional true} :string]
    ;; The DID of the listener.
    [:did {:optional true} :string]
    ;; The handle of the listener.
    [:handle {:optional true} :string]
    ;; The display name of the listener.
    [:displayName {:optional true} :string]
    ;; The URL of the listener's avatar image.
    [:avatar {:optional true} :string]
    ;; The timestamp of the listener's most recent scrobble of this song.
    [:timestamp {:optional true} :string]
    ;; The URI of the listener's most recent scrobble of this song.
    [:scrobbleUri {:optional true} :string]
    ]
   :SongRecord
   [:map
    ;; The title of the song.
    [:title :string]
    ;; The artist of the song.
    [:artist :string]
    ;; The artists of the song with MusicBrainz IDs.
    [:artists {:optional true} [:vector :ArtistMbid]]
    ;; The album artist of the song.
    [:albumArtist :string]
    ;; The album of the song.
    [:album :string]
    ;; The duration of the song in milliseconds.
    [:duration :int]
    ;; The track number of the song in the album.
    [:trackNumber {:optional true} :int]
    ;; The disc number of the song in the album.
    [:discNumber {:optional true} :int]
    ;; The release date of the song.
    [:releaseDate {:optional true} :string]
    ;; The year the song was released.
    [:year {:optional true} :int]
    ;; The genre of the song.
    [:genre {:optional true} :string]
    ;; The tags of the song.
    [:tags {:optional true} [:vector :string]]
    ;; The composer of the song.
    [:composer {:optional true} :string]
    ;; The lyrics of the song.
    [:lyrics {:optional true} :string]
    ;; The copyright message of the song.
    [:copyrightMessage {:optional true} :string]
    ;; Informations about the song
    [:wiki {:optional true} :string]
    ;; The album art of the song.
    [:albumArt {:optional true} :BlobRef]
    ;; The URL of the album art of the song.
    [:albumArtUrl {:optional true} :string]
    ;; The YouTube link of the song.
    [:youtubeLink {:optional true} :string]
    ;; The Spotify link of the song.
    [:spotifyLink {:optional true} :string]
    ;; The Tidal link of the song.
    [:tidalLink {:optional true} :string]
    ;; The Apple Music link of the song.
    [:appleMusicLink {:optional true} :string]
    ;; The date when the song was created.
    [:createdAt :string]
    ;; The MusicBrainz ID of the song.
    [:mbid {:optional true} :string]
    ;; The label of the song.
    [:label {:optional true} :string]
    ;; The International Standard Recording Code (ISRC) of the song.
    [:isrc {:optional true} :string]
    ]
   :SongViewBasic
   [:map
    ;; The unique identifier of the song.
    [:id {:optional true} :string]
    ;; The title of the song.
    [:title {:optional true} :string]
    ;; The artist of the song.
    [:artist {:optional true} :string]
    ;; The artist of the album the song belongs to.
    [:albumArtist {:optional true} :string]
    ;; The URL of the album art image.
    [:albumArt {:optional true} :string]
    ;; The URI of the song.
    [:uri {:optional true} :string]
    ;; The album of the song.
    [:album {:optional true} :string]
    ;; The duration of the song in milliseconds.
    [:duration {:optional true} :int]
    ;; The track number of the song in the album.
    [:trackNumber {:optional true} :int]
    ;; The disc number of the song in the album.
    [:discNumber {:optional true} :int]
    ;; The number of times the song has been played.
    [:playCount {:optional true} :int]
    ;; The number of unique listeners who have played the song.
    [:uniqueListeners {:optional true} :int]
    ;; The URI of the album the song belongs to.
    [:albumUri {:optional true} :string]
    ;; The URI of the artist of the song.
    [:artistUri {:optional true} :string]
    ;; The SHA256 hash of the song.
    [:sha256 {:optional true} :string]
    ;; The MusicBrainz ID of the song.
    [:mbid {:optional true} :string]
    ;; The International Standard Recording Code (ISRC) of the song.
    [:isrc {:optional true} :string]
    [:tags {:optional true} [:vector :string]]
    ;; The timestamp when the song was created.
    [:createdAt {:optional true} :string]
    ]
   :SongViewDetailed
   [:map
    ;; The unique identifier of the song.
    [:id {:optional true} :string]
    ;; The title of the song.
    [:title {:optional true} :string]
    ;; The artist of the song.
    [:artist {:optional true} :string]
    ;; The artist of the album the song belongs to.
    [:albumArtist {:optional true} :string]
    ;; The URL of the album art image.
    [:albumArt {:optional true} :string]
    ;; The URI of the song.
    [:uri {:optional true} :string]
    ;; The album of the song.
    [:album {:optional true} :string]
    ;; The duration of the song in milliseconds.
    [:duration {:optional true} :int]
    ;; The track number of the song in the album.
    [:trackNumber {:optional true} :int]
    ;; The disc number of the song in the album.
    [:discNumber {:optional true} :int]
    ;; The number of times the song has been played.
    [:playCount {:optional true} :int]
    ;; The number of unique listeners who have played the song.
    [:uniqueListeners {:optional true} :int]
    ;; The URI of the album the song belongs to.
    [:albumUri {:optional true} :string]
    ;; The URI of the artist of the song.
    [:artistUri {:optional true} :string]
    ;; The SHA256 hash of the song.
    [:sha256 {:optional true} :string]
    ;; The MusicBrainz ID of the song.
    [:mbid {:optional true} :string]
    ;; The International Standard Recording Code (ISRC) of the song.
    [:isrc {:optional true} :string]
    [:tags {:optional true} [:vector :string]]
    ;; The timestamp when the song was created.
    [:createdAt {:optional true} :string]
    [:artists {:optional true} [:vector :ArtistViewBasic]]
    ;; The first scrobble of this song on Rocksky.
    [:firstScrobble {:optional true} :SongFirstScrobbleView]
    ]
   :SpotifyTrackView
   [:map
    ;; The unique identifier of the Spotify track.
    [:id {:optional true} :string]
    ;; The name of the track.
    [:name {:optional true} :string]
    ;; The name of the artist.
    [:artist {:optional true} :string]
    ;; The name of the album.
    [:album {:optional true} :string]
    ;; The duration of the track in milliseconds.
    [:duration {:optional true} :int]
    ;; A URL to a preview of the track.
    [:previewUrl {:optional true} :string]
    ]
   :StartPlaylistParams
   [:map
    ;; The URI of the playlist to start
    [:uri :string]
    ;; Whether to shuffle the playlist when starting it
    [:shuffle {:optional true} :boolean]
    ;; The position in the playlist to start from, if not specified, starts from the beginning
    [:position {:optional true} :int]
    ]
   :StatsGlobalStatsView
   [:map
    ;; Total scrobbles across all users on Rocksky.
    [:scrobbles {:optional true} :int]
    ;; Total number of users on Rocksky.
    [:users {:optional true} :int]
    ;; Total number of artists known to Rocksky.
    [:artists {:optional true} :int]
    ;; Total number of albums known to Rocksky.
    [:albums {:optional true} :int]
    ;; Total number of tracks known to Rocksky.
    [:tracks {:optional true} :int]
    ]
   :StatsView
   [:map
    ;; The total number of scrobbles.
    [:scrobbles {:optional true} :int]
    ;; The total number of unique artists scrobbled.
    [:artists {:optional true} :int]
    ;; The total number of tracks marked as loved.
    [:lovedTracks {:optional true} :int]
    ;; The total number of unique albums scrobbled.
    [:albums {:optional true} :int]
    ;; The total number of unique tracks scrobbled.
    [:tracks {:optional true} :int]
    ]
   :StatsWrappedAlbum
   [:map
    ;; The unique identifier of the album.
    [:id {:optional true} :string]
    ;; The title of the album.
    [:title {:optional true} :string]
    ;; The artist of the album.
    [:artist {:optional true} :string]
    ;; The album art URL.
    [:albumArt {:optional true} :string]
    ;; The AT-URI of the album.
    [:uri {:optional true} :string]
    ;; Number of plays in the wrapped period.
    [:playCount {:optional true} :int]
    ]
   :StatsWrappedArtist
   [:map
    ;; The unique identifier of the artist.
    [:id {:optional true} :string]
    ;; The name of the artist.
    [:name {:optional true} :string]
    ;; The picture URL of the artist.
    [:picture {:optional true} :string]
    ;; The AT-URI of the artist.
    [:uri {:optional true} :string]
    ;; Number of plays in the wrapped period.
    [:playCount {:optional true} :int]
    ]
   :StatsWrappedDayCount
   [:map
    ;; The date (YYYY-MM-DD).
    [:date {:optional true} :string]
    ;; Number of scrobbles on this day.
    [:count {:optional true} :int]
    ]
   :StatsWrappedGenreCount
   [:map
    ;; The genre name.
    [:genre {:optional true} :string]
    ;; Number of scrobbles for this genre.
    [:count {:optional true} :int]
    ]
   :StatsWrappedMilestone
   [:map
    ;; The title of the track.
    [:trackTitle {:optional true} :string]
    ;; The name of the artist.
    [:artistName {:optional true} :string]
    ;; The timestamp of the scrobble.
    [:timestamp {:optional true} :string]
    ;; AT-URI of the track record, used to build a clickable link to the song page.
    [:trackUri {:optional true} :string]
    ]
   :StatsWrappedMonthCount
   [:map
    ;; Month number (1-12).
    [:month {:optional true} :int]
    ;; Number of scrobbles in this month.
    [:count {:optional true} :int]
    ]
   :StatsWrappedTrack
   [:map
    ;; The unique identifier of the track.
    [:id {:optional true} :string]
    ;; The title of the track.
    [:title {:optional true} :string]
    ;; The artist of the track.
    [:artist {:optional true} :string]
    ;; The album art URL.
    [:albumArt {:optional true} :string]
    ;; The AT-URI of the track.
    [:uri {:optional true} :string]
    ;; The AT-URI of the artist.
    [:artistUri {:optional true} :string]
    ;; The AT-URI of the album.
    [:albumUri {:optional true} :string]
    ;; Number of plays in the wrapped period.
    [:playCount {:optional true} :int]
    ]
   :StatsWrappedView
   [:map
    ;; The year of the wrapped stats.
    [:year {:optional true} :int]
    ;; Total scrobbles in the year.
    [:totalScrobbles {:optional true} :int]
    ;; Total listening time in minutes.
    [:totalListeningTimeMinutes {:optional true} :int]
    ;; Top 5 artists by play count.
    [:topArtists {:optional true} [:vector :StatsWrappedArtist]]
    ;; Top 5 tracks by play count.
    [:topTracks {:optional true} [:vector :StatsWrappedTrack]]
    ;; Top 5 albums by play count.
    [:topAlbums {:optional true} [:vector :StatsWrappedAlbum]]
    ;; Top genres by play count.
    [:topGenres {:optional true} [:vector :StatsWrappedGenreCount]]
    ;; Scrobble counts per month.
    [:scrobblesPerMonth {:optional true} [:vector :StatsWrappedMonthCount]]
    ;; The most active day of the year.
    [:mostActiveDay {:optional true} :StatsWrappedDayCount]
    ;; The most active hour of the day (0-23).
    [:mostActiveHour {:optional true} :int]
    ;; Number of artists heard for the first time this year.
    [:newArtistsCount {:optional true} :int]
    ;; Longest consecutive days streak.
    [:longestStreak {:optional true} :int]
    ;; The first scrobble of the year.
    [:firstScrobble {:optional true} :StatsWrappedMilestone]
    ;; The last scrobble of the year.
    [:lastScrobble {:optional true} :StatsWrappedMilestone]
    ]
   :StatusRecord
   [:map
    ;; The track currently being played.
    [:track :ActorTrackView]
    ;; When the track started playing.
    [:startedAt :string]
    ;; When the status expires. Defaults to startedAt plus track duration plus idle time.
    [:expiresAt {:optional true} :string]
    ]
   :StrongRef
   [:map
    [:uri :string]
    [:cid :string]
    ]
   :UnfollowAccountOutput
   [:map
    [:subject :ActorProfileViewBasic]
    [:followers [:vector :ActorProfileViewBasic]]
    ;; A cursor value to pass to subsequent calls to get the next page of results.
    [:cursor {:optional true} :string]
    ]
   :UnfollowAccountParams
   [:map
    [:account :string]
    ]
   :UpdateApikeyInput
   [:map
    ;; The ID of the API key to update.
    [:id :string]
    ;; The new name of the API key.
    [:name :string]
    ;; A new description for the API key.
    [:description {:optional true} :string]
    ]
   })

(defn schema
  "Look up a generated schema by keyword."
  [k]
  (get schemas k))
