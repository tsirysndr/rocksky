package rocksky

// Types mirror the view definitions in apps/api/lexicons. JSON tags use the
// camelCase keys emitted by the XRPC server; Go fields keep idiomatic naming.

// ProfileViewBasic is the lightweight profile shape used in lists.
// Lexicon: app.rocksky.actor.defs#profileViewBasic.
type ProfileViewBasic struct {
	ID          string `json:"id,omitempty"`
	DID         string `json:"did,omitempty"`
	Handle      string `json:"handle,omitempty"`
	DisplayName string `json:"displayName,omitempty"`
	Avatar      string `json:"avatar,omitempty"`
	CreatedAt   string `json:"createdAt,omitempty"`
	UpdatedAt   string `json:"updatedAt,omitempty"`
}

// ProfileViewDetailed is the full profile returned by Actor.GetProfile.
// Lexicon: app.rocksky.actor.defs#profileViewDetailed.
type ProfileViewDetailed struct {
	ID               string `json:"id,omitempty"`
	DID              string `json:"did,omitempty"`
	Handle           string `json:"handle,omitempty"`
	DisplayName      string `json:"displayName,omitempty"`
	Avatar           string `json:"avatar,omitempty"`
	CreatedAt        string `json:"createdAt,omitempty"`
	UpdatedAt        string `json:"updatedAt,omitempty"`
	SpotifyConnected bool   `json:"spotifyConnected,omitempty"`
}

// ArtistViewBasic — lexicon: app.rocksky.artist.defs#artistViewBasic.
type ArtistViewBasic struct {
	ID              string   `json:"id,omitempty"`
	URI             string   `json:"uri,omitempty"`
	Name            string   `json:"name,omitempty"`
	Picture         string   `json:"picture,omitempty"`
	SHA256          string   `json:"sha256,omitempty"`
	PlayCount       int      `json:"playCount,omitempty"`
	UniqueListeners int      `json:"uniqueListeners,omitempty"`
	Tags            []string `json:"tags,omitempty"`
}

// ArtistViewDetailed — lexicon: app.rocksky.artist.defs#artistViewDetailed.
type ArtistViewDetailed = ArtistViewBasic

// AlbumViewBasic — lexicon: app.rocksky.album.defs#albumViewBasic.
type AlbumViewBasic struct {
	ID              string `json:"id,omitempty"`
	URI             string `json:"uri,omitempty"`
	Title           string `json:"title,omitempty"`
	Artist          string `json:"artist,omitempty"`
	ArtistURI       string `json:"artistUri,omitempty"`
	Year            int    `json:"year,omitempty"`
	AlbumArt        string `json:"albumArt,omitempty"`
	ReleaseDate     string `json:"releaseDate,omitempty"`
	SHA256          string `json:"sha256,omitempty"`
	PlayCount       int    `json:"playCount,omitempty"`
	UniqueListeners int    `json:"uniqueListeners,omitempty"`
}

// AlbumViewDetailed — lexicon: app.rocksky.album.defs#albumViewDetailed.
type AlbumViewDetailed struct {
	AlbumViewBasic
	Tags   []string         `json:"tags,omitempty"`
	Tracks []SongViewBasic  `json:"tracks,omitempty"`
}

// SongViewBasic — lexicon: app.rocksky.song.defs#songViewBasic.
type SongViewBasic struct {
	ID              string   `json:"id,omitempty"`
	Title           string   `json:"title,omitempty"`
	Artist          string   `json:"artist,omitempty"`
	AlbumArtist     string   `json:"albumArtist,omitempty"`
	AlbumArt        string   `json:"albumArt,omitempty"`
	URI             string   `json:"uri,omitempty"`
	Album           string   `json:"album,omitempty"`
	Duration        int      `json:"duration,omitempty"`
	TrackNumber     int      `json:"trackNumber,omitempty"`
	DiscNumber      int      `json:"discNumber,omitempty"`
	PlayCount       int      `json:"playCount,omitempty"`
	UniqueListeners int      `json:"uniqueListeners,omitempty"`
	AlbumURI        string   `json:"albumUri,omitempty"`
	ArtistURI       string   `json:"artistUri,omitempty"`
	SHA256          string   `json:"sha256,omitempty"`
	MBID            string   `json:"mbid,omitempty"`
	ISRC            string   `json:"isrc,omitempty"`
	Tags            []string `json:"tags,omitempty"`
	CreatedAt       string   `json:"createdAt,omitempty"`
}

// SongViewDetailed — lexicon: app.rocksky.song.defs#songViewDetailed.
type SongViewDetailed struct {
	SongViewBasic
	Artists       []ArtistViewBasic   `json:"artists,omitempty"`
	FirstScrobble *FirstScrobbleView  `json:"firstScrobble,omitempty"`
}

// FirstScrobbleView — used by song and scrobble detailed views.
type FirstScrobbleView struct {
	Handle    string `json:"handle,omitempty"`
	Avatar    string `json:"avatar,omitempty"`
	Timestamp string `json:"timestamp,omitempty"`
}

// ScrobbleViewBasic — lexicon: app.rocksky.scrobble.defs#scrobbleViewBasic.
type ScrobbleViewBasic struct {
	ID              string `json:"id,omitempty"`
	User            string `json:"user,omitempty"`
	UserDisplayName string `json:"userDisplayName,omitempty"`
	UserAvatar      string `json:"userAvatar,omitempty"`
	Title           string `json:"title,omitempty"`
	Artist          string `json:"artist,omitempty"`
	ArtistURI       string `json:"artistUri,omitempty"`
	Album           string `json:"album,omitempty"`
	AlbumURI        string `json:"albumUri,omitempty"`
	Cover           string `json:"cover,omitempty"`
	Date            string `json:"date,omitempty"`
	URI             string `json:"uri,omitempty"`
	SHA256          string `json:"sha256,omitempty"`
	Liked           bool   `json:"liked,omitempty"`
	LikesCount      int    `json:"likesCount,omitempty"`
}

// ScrobbleViewDetailed — lexicon: app.rocksky.scrobble.defs#scrobbleViewDetailed.
type ScrobbleViewDetailed struct {
	ScrobbleViewBasic
	Listeners     int                `json:"listeners,omitempty"`
	Scrobbles     int                `json:"scrobbles,omitempty"`
	Artists       []ArtistViewBasic  `json:"artists,omitempty"`
	FirstScrobble *FirstScrobbleView `json:"firstScrobble,omitempty"`
}

// RecentListenerView — used by artist/song recent listeners endpoints.
type RecentListenerView struct {
	ID          string `json:"id,omitempty"`
	DID         string `json:"did,omitempty"`
	Handle      string `json:"handle,omitempty"`
	DisplayName string `json:"displayName,omitempty"`
	Avatar      string `json:"avatar,omitempty"`
	Timestamp   string `json:"timestamp,omitempty"`
	ScrobbleURI string `json:"scrobbleUri,omitempty"`
}

// ListenerViewBasic — used by Artist.GetArtistListeners.
type ListenerViewBasic struct {
	ID               string         `json:"id,omitempty"`
	DID              string         `json:"did,omitempty"`
	Handle           string         `json:"handle,omitempty"`
	DisplayName      string         `json:"displayName,omitempty"`
	Avatar           string         `json:"avatar,omitempty"`
	MostListenedSong *SongViewBasic `json:"mostListenedSong,omitempty"`
	TotalPlays       int            `json:"totalPlays,omitempty"`
	Rank             int            `json:"rank,omitempty"`
}

// ChartPoint — lexicon: app.rocksky.charts.defs#scrobbleViewBasic (one (date, count) bucket).
type ChartPoint struct {
	Date  string `json:"date,omitempty"`
	Count int    `json:"count,omitempty"`
}

// StatsView — lexicon: app.rocksky.stats.defs#statsView.
type StatsView struct {
	Scrobbles   int `json:"scrobbles,omitempty"`
	Artists     int `json:"artists,omitempty"`
	LovedTracks int `json:"lovedTracks,omitempty"`
	Albums      int `json:"albums,omitempty"`
	Tracks      int `json:"tracks,omitempty"`
}

// WrappedView — lexicon: app.rocksky.stats.defs#wrappedView.
type WrappedView struct {
	Year                      int                `json:"year,omitempty"`
	TotalScrobbles            int                `json:"totalScrobbles,omitempty"`
	TotalListeningTimeMinutes int                `json:"totalListeningTimeMinutes,omitempty"`
	TopArtists                []WrappedArtist    `json:"topArtists,omitempty"`
	TopTracks                 []WrappedTrack     `json:"topTracks,omitempty"`
	TopAlbums                 []WrappedAlbum     `json:"topAlbums,omitempty"`
	TopGenres                 []WrappedGenre     `json:"topGenres,omitempty"`
	ScrobblesPerMonth         []WrappedMonth     `json:"scrobblesPerMonth,omitempty"`
	MostActiveDay             *WrappedDay        `json:"mostActiveDay,omitempty"`
	MostActiveHour            int                `json:"mostActiveHour,omitempty"`
	NewArtistsCount           int                `json:"newArtistsCount,omitempty"`
	LongestStreak             int                `json:"longestStreak,omitempty"`
	FirstScrobble             *WrappedMilestone  `json:"firstScrobble,omitempty"`
	LastScrobble              *WrappedMilestone  `json:"lastScrobble,omitempty"`
}

type WrappedArtist struct {
	ID        string `json:"id,omitempty"`
	Name      string `json:"name,omitempty"`
	Picture   string `json:"picture,omitempty"`
	URI       string `json:"uri,omitempty"`
	PlayCount int    `json:"playCount,omitempty"`
}

type WrappedTrack struct {
	ID        string `json:"id,omitempty"`
	Title     string `json:"title,omitempty"`
	Artist    string `json:"artist,omitempty"`
	AlbumArt  string `json:"albumArt,omitempty"`
	URI       string `json:"uri,omitempty"`
	ArtistURI string `json:"artistUri,omitempty"`
	AlbumURI  string `json:"albumUri,omitempty"`
	PlayCount int    `json:"playCount,omitempty"`
}

type WrappedAlbum struct {
	ID        string `json:"id,omitempty"`
	Title     string `json:"title,omitempty"`
	Artist    string `json:"artist,omitempty"`
	AlbumArt  string `json:"albumArt,omitempty"`
	URI       string `json:"uri,omitempty"`
	PlayCount int    `json:"playCount,omitempty"`
}

type WrappedGenre struct {
	Genre string `json:"genre,omitempty"`
	Count int    `json:"count,omitempty"`
}

type WrappedMonth struct {
	Month int `json:"month,omitempty"`
	Count int `json:"count,omitempty"`
}

type WrappedDay struct {
	Date  string `json:"date,omitempty"`
	Count int    `json:"count,omitempty"`
}

type WrappedMilestone struct {
	TrackTitle string `json:"trackTitle,omitempty"`
	ArtistName string `json:"artistName,omitempty"`
	Timestamp  string `json:"timestamp,omitempty"`
	TrackURI   string `json:"trackUri,omitempty"`
}

// SearchResultsView — lexicon: app.rocksky.feed.defs#searchResultsView.
// Hits is a heterogeneous list (song / album / artist / playlist / profile);
// each item is left as a raw map so callers can dispatch on its $type or shape.
type SearchResultsView struct {
	Hits                []map[string]any `json:"hits,omitempty"`
	ProcessingTimeMS    int              `json:"processingTimeMs,omitempty"`
	Limit               int              `json:"limit,omitempty"`
	Offset              int              `json:"offset,omitempty"`
	EstimatedTotalHits  int              `json:"estimatedTotalHits,omitempty"`
}

// StoryView — lexicon: app.rocksky.feed.defs#storyView.
type StoryView struct {
	Album       string `json:"album,omitempty"`
	AlbumArt    string `json:"albumArt,omitempty"`
	AlbumArtist string `json:"albumArtist,omitempty"`
	AlbumURI    string `json:"albumUri,omitempty"`
	Artist      string `json:"artist,omitempty"`
	ArtistURI   string `json:"artistUri,omitempty"`
	Avatar      string `json:"avatar,omitempty"`
	CreatedAt   string `json:"createdAt,omitempty"`
	DID         string `json:"did,omitempty"`
	Handle      string `json:"handle,omitempty"`
	ID          string `json:"id,omitempty"`
	Title       string `json:"title,omitempty"`
	TrackID     string `json:"trackId,omitempty"`
	TrackURI    string `json:"trackUri,omitempty"`
	URI         string `json:"uri,omitempty"`
}

// RecommendationView — lexicon: app.rocksky.feed.defs#recommendationView.
type RecommendationView struct {
	Title               string   `json:"title,omitempty"`
	Artist              string   `json:"artist,omitempty"`
	Album               string   `json:"album,omitempty"`
	AlbumArt            string   `json:"albumArt,omitempty"`
	TrackURI            string   `json:"trackUri,omitempty"`
	ArtistURI           string   `json:"artistUri,omitempty"`
	AlbumURI            string   `json:"albumUri,omitempty"`
	Genres              []string `json:"genres,omitempty"`
	RecommendationScore int      `json:"recommendationScore,omitempty"`
	Source              string   `json:"source,omitempty"`
	LikesCount          int      `json:"likesCount,omitempty"`
}

// RecommendedArtistView — lexicon: app.rocksky.feed.defs#recommendedArtistView.
type RecommendedArtistView struct {
	ID                  string   `json:"id,omitempty"`
	URI                 string   `json:"uri,omitempty"`
	Name                string   `json:"name,omitempty"`
	Picture             string   `json:"picture,omitempty"`
	Genres              []string `json:"genres,omitempty"`
	RecommendationScore int      `json:"recommendationScore,omitempty"`
	Source              string   `json:"source,omitempty"`
}

// RecommendedAlbumView — lexicon: app.rocksky.feed.defs#recommendedAlbumView.
type RecommendedAlbumView struct {
	ID                  string `json:"id,omitempty"`
	URI                 string `json:"uri,omitempty"`
	Title               string `json:"title,omitempty"`
	Artist              string `json:"artist,omitempty"`
	ArtistURI           string `json:"artistUri,omitempty"`
	Year                int    `json:"year,omitempty"`
	AlbumArt            string `json:"albumArt,omitempty"`
	RecommendationScore int    `json:"recommendationScore,omitempty"`
	Source              string `json:"source,omitempty"`
}

// FeedItemView wraps a single scrobble in the public feed.
type FeedItemView struct {
	Scrobble ScrobbleViewBasic `json:"scrobble,omitempty"`
}

// ShoutAuthor — lexicon: app.rocksky.shout.defs#author.
type ShoutAuthor struct {
	ID          string `json:"id,omitempty"`
	DID         string `json:"did,omitempty"`
	Handle      string `json:"handle,omitempty"`
	DisplayName string `json:"displayName,omitempty"`
	Avatar      string `json:"avatar,omitempty"`
}

// ShoutView — lexicon: app.rocksky.shout.defs#shoutView.
type ShoutView struct {
	ID        string       `json:"id,omitempty"`
	Message   string       `json:"message,omitempty"`
	Parent    string       `json:"parent,omitempty"`
	CreatedAt string       `json:"createdAt,omitempty"`
	Author    *ShoutAuthor `json:"author,omitempty"`
}
