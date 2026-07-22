// Package rocksky is the official Go SDK for Rocksky (https://rocksky.app), a
// music scrobbling & discovery platform on the AT Protocol.
//
// It is built on bluesky-social/indigo: [Client] does unauthenticated AppView
// reads, and [Agent] logs in with an app password and writes app.rocksky.*
// records to the user's PDS (scrobble fan-out, like, follow, shout). The typed
// record & view structs live in the generated rocksky/gen package.
package rocksky

import (
	"context"
	"encoding/json"
	"strconv"
	"strings"
	"time"

	"github.com/bluesky-social/indigo/xrpc"
	"github.com/tsirysndr/rocksky/sdk/go/rocksky/gen"
)

// DefaultAppView is the public Rocksky AppView base URL.
const DefaultAppView = "https://api.rocksky.app"

// Client is an unauthenticated read client over the public Rocksky AppView XRPC.
type Client struct {
	xrpc *xrpc.Client
}

// NewClient builds a read client against an AppView base URL. Pass "" for
// [DefaultAppView].
func NewClient(appview string) *Client {
	if appview == "" {
		appview = DefaultAppView
	}
	return &Client{xrpc: &xrpc.Client{Host: strings.TrimRight(appview, "/")}}
}

// WithToken attaches a bearer access token, sent as Authorization: Bearer on
// every read — needed only for auth-gated queries. Returns the client for
// chaining: rocksky.NewClient("").WithToken(tok).
func (c *Client) WithToken(token string) *Client {
	c.xrpc.Auth = &xrpc.AuthInfo{AccessJwt: token}
	return c
}

func (c *Client) query(ctx context.Context, nsid string, params map[string]any, out any) error {
	filtered := make(map[string]any, len(params))
	for k, v := range params {
		if s, ok := v.(string); ok && s == "" {
			continue
		}
		filtered[k] = v
	}
	return c.xrpc.Do(ctx, xrpc.Query, "", nsid, filtered, nil, out)
}

// Profile returns an actor's detailed profile. actor is a handle or DID.
func (c *Client) Profile(ctx context.Context, actor string) (*gen.ActorProfileViewDetailed, error) {
	var out gen.ActorProfileViewDetailed
	err := c.query(ctx, "app.rocksky.actor.getProfile", map[string]any{"did": actor}, &out)
	return &out, err
}

// Scrobbles returns an actor's scrobbles, newest first.
func (c *Client) Scrobbles(ctx context.Context, actor string, limit, offset int) ([]gen.ScrobbleViewBasic, error) {
	var out gen.GetActorScrobblesOutput
	err := c.query(ctx, "app.rocksky.actor.getActorScrobbles",
		map[string]any{"did": actor, "limit": limit, "offset": offset}, &out)
	return out.Scrobbles, err
}

// Songs returns an actor's most-played songs.
func (c *Client) Songs(ctx context.Context, actor string, limit, offset int) ([]gen.SongViewBasic, error) {
	var out tracksOut
	err := c.query(ctx, "app.rocksky.actor.getActorSongs",
		map[string]any{"did": actor, "limit": limit, "offset": offset}, &out)
	return out.Tracks, err
}

// Albums returns an actor's most-played albums.
func (c *Client) Albums(ctx context.Context, actor string, limit, offset int) ([]gen.AlbumViewBasic, error) {
	var out gen.GetActorAlbumsOutput
	err := c.query(ctx, "app.rocksky.actor.getActorAlbums",
		map[string]any{"did": actor, "limit": limit, "offset": offset}, &out)
	return out.Albums, err
}

// Artists returns an actor's most-played artists.
func (c *Client) Artists(ctx context.Context, actor string, limit, offset int) ([]gen.ArtistViewBasic, error) {
	var out gen.GetActorArtistsOutput
	err := c.query(ctx, "app.rocksky.actor.getActorArtists",
		map[string]any{"did": actor, "limit": limit, "offset": offset}, &out)
	return out.Artists, err
}

// TopTracks returns the platform-wide top tracks chart.
func (c *Client) TopTracks(ctx context.Context, limit, offset int) ([]gen.SongViewBasic, error) {
	var out gen.GetTopTracksOutput
	err := c.query(ctx, "app.rocksky.charts.getTopTracks",
		map[string]any{"limit": limit, "offset": offset}, &out)
	return out.Tracks, err
}

// TopArtists returns the platform-wide top artists chart.
func (c *Client) TopArtists(ctx context.Context, limit, offset int) ([]gen.ArtistViewBasic, error) {
	var out gen.GetTopArtistsOutput
	err := c.query(ctx, "app.rocksky.charts.getTopArtists",
		map[string]any{"limit": limit, "offset": offset}, &out)
	return out.Artists, err
}

// Search runs a full-text search across songs, albums, artists, playlists, actors.
func (c *Client) Search(ctx context.Context, query string) (*gen.FeedSearchResultsView, error) {
	var out gen.FeedSearchResultsView
	err := c.query(ctx, "app.rocksky.feed.search", map[string]any{"query": query}, &out)
	return &out, err
}

// GlobalStats returns platform-wide totals.
func (c *Client) GlobalStats(ctx context.Context) (*gen.StatsGlobalStatsView, error) {
	var out gen.StatsGlobalStatsView
	err := c.query(ctx, "app.rocksky.stats.getGlobalStats", nil, &out)
	return &out, err
}

// Local response envelopes keyed on the production JSON (some generated Output
// types drift from what the AppView actually returns, e.g. getActorSongs -> tracks).
type (
	tracksOut struct {
		Tracks []gen.SongViewBasic `json:"tracks"`
	}
	albumsOut struct {
		Albums []gen.AlbumViewBasic `json:"albums"`
	}
	artistsOut struct {
		Artists []gen.ArtistViewBasic `json:"artists"`
	}
	scrobblesOut struct {
		Scrobbles []gen.ScrobbleViewBasic `json:"scrobbles"`
	}
	followsOut struct {
		Follows []gen.ActorProfileViewBasic `json:"follows"`
	}
	followersOut struct {
		Followers []gen.ActorProfileViewBasic `json:"followers"`
	}
)

// Get calls any AppView read query by nsid and returns the raw JSON response.
// Every method below is sugar over this; use it for queries without a wrapper.
func (c *Client) Get(ctx context.Context, nsid string, params map[string]any) (json.RawMessage, error) {
	var out json.RawMessage
	err := c.query(ctx, nsid, params, &out)
	return out, err
}

// LovedSongs returns an actor's loved (liked) songs.
func (c *Client) LovedSongs(ctx context.Context, actor string, limit, offset int) ([]gen.SongViewBasic, error) {
	var out tracksOut
	err := c.query(ctx, "app.rocksky.actor.getActorLovedSongs",
		map[string]any{"did": actor, "limit": limit, "offset": offset}, &out)
	return out.Tracks, err
}

// CatalogAlbums returns the album catalog, optionally filtered by genre.
func (c *Client) CatalogAlbums(ctx context.Context, limit, offset int, genre string) ([]gen.AlbumViewBasic, error) {
	var out albumsOut
	err := c.query(ctx, "app.rocksky.album.getAlbums",
		map[string]any{"limit": limit, "offset": offset, "genre": genre}, &out)
	return out.Albums, err
}

// CatalogArtists returns the artist catalog, optionally filtered by genre.
func (c *Client) CatalogArtists(ctx context.Context, limit, offset int, genre string) ([]gen.ArtistViewBasic, error) {
	var out artistsOut
	err := c.query(ctx, "app.rocksky.artist.getArtists",
		map[string]any{"limit": limit, "offset": offset, "genre": genre}, &out)
	return out.Artists, err
}

// CatalogSongs returns the song catalog, optionally filtered by genre.
func (c *Client) CatalogSongs(ctx context.Context, limit, offset int, genre string) ([]gen.SongViewBasic, error) {
	var out tracksOut
	err := c.query(ctx, "app.rocksky.song.getSongs",
		map[string]any{"limit": limit, "offset": offset, "genre": genre}, &out)
	return out.Tracks, err
}

// AlbumTracks returns an album's tracklist by album at:// URI.
func (c *Client) AlbumTracks(ctx context.Context, uri string) ([]gen.SongViewBasic, error) {
	var out tracksOut
	err := c.query(ctx, "app.rocksky.album.getAlbumTracks", map[string]any{"uri": uri}, &out)
	return out.Tracks, err
}

// ArtistAlbums returns an artist's albums by artist at:// URI.
func (c *Client) ArtistAlbums(ctx context.Context, uri string) ([]gen.AlbumViewBasic, error) {
	var out albumsOut
	err := c.query(ctx, "app.rocksky.artist.getArtistAlbums", map[string]any{"uri": uri}, &out)
	return out.Albums, err
}

// ArtistTracks returns an artist's top tracks by artist at:// URI.
func (c *Client) ArtistTracks(ctx context.Context, uri string, limit, offset int) ([]gen.SongViewBasic, error) {
	var out tracksOut
	err := c.query(ctx, "app.rocksky.artist.getArtistTracks",
		map[string]any{"uri": uri, "limit": limit, "offset": offset}, &out)
	return out.Tracks, err
}

// ScrobbleFeed returns a social/global scrobbles feed. Pass did to scope to an
// actor and following=true for their follow graph.
func (c *Client) ScrobbleFeed(ctx context.Context, did string, following bool, limit, offset int) ([]gen.ScrobbleViewBasic, error) {
	var out scrobblesOut
	err := c.query(ctx, "app.rocksky.scrobble.getScrobbles",
		map[string]any{"did": did, "following": following, "limit": limit, "offset": offset}, &out)
	return out.Scrobbles, err
}

// Scrobble returns a single scrobble by its at:// URI.
func (c *Client) Scrobble(ctx context.Context, uri string) (*gen.ScrobbleViewBasic, error) {
	var out gen.ScrobbleViewBasic
	err := c.query(ctx, "app.rocksky.scrobble.getScrobble", map[string]any{"uri": uri}, &out)
	return &out, err
}

// Follows returns the accounts actor follows.
func (c *Client) Follows(ctx context.Context, actor string, limit int, cursor string) ([]gen.ActorProfileViewBasic, error) {
	var out followsOut
	err := c.query(ctx, "app.rocksky.graph.getFollows",
		map[string]any{"actor": actor, "limit": limit, "cursor": cursor}, &out)
	return out.Follows, err
}

// Followers returns the accounts that follow actor.
func (c *Client) Followers(ctx context.Context, actor string, limit int, cursor string) ([]gen.ActorProfileViewBasic, error) {
	var out followersOut
	err := c.query(ctx, "app.rocksky.graph.getFollowers",
		map[string]any{"actor": actor, "limit": limit, "cursor": cursor}, &out)
	return out.Followers, err
}

// KnownFollowers returns followers of actor that the viewer also follows.
func (c *Client) KnownFollowers(ctx context.Context, actor string, limit int, cursor string) ([]gen.ActorProfileViewBasic, error) {
	var out followersOut
	err := c.query(ctx, "app.rocksky.graph.getKnownFollowers",
		map[string]any{"actor": actor, "limit": limit, "cursor": cursor}, &out)
	return out.Followers, err
}

// Feed returns a feed by its at:// URI. Paginate via cursor ("" for first page).
func (c *Client) Feed(ctx context.Context, feed string, limit int, cursor string) (json.RawMessage, error) {
	return c.Get(ctx, "app.rocksky.feed.getFeed",
		map[string]any{"feed": feed, "limit": limit, "cursor": cursor})
}

// ---- typed date-window charts ------------------------------------------

// DateInterval is a typed date window for the top-chart queries. Build it with
// AllTime, LastDays/LastWeeks/LastMonths/LastYears, or Range.
type DateInterval struct{ start, end string }

// AllTime is the unbounded (all-time) chart.
func AllTime() DateInterval { return DateInterval{} }

// LastDays is a rolling window of the last n days ending now.
func LastDays(n int) DateInterval { return since(0, 0, -n) }

// LastWeeks is a rolling window of the last n weeks ending now.
func LastWeeks(n int) DateInterval { return since(0, 0, -7*n) }

// LastMonths is a rolling window of the last n months ending now.
func LastMonths(n int) DateInterval { return since(0, -n, 0) }

// LastYears is a rolling window of the last n years ending now.
func LastYears(n int) DateInterval { return since(-n, 0, 0) }

// Range is an explicit closed [start, end] window.
func Range(start, end time.Time) DateInterval {
	return DateInterval{start: start.UTC().Format(time.RFC3339), end: end.UTC().Format(time.RFC3339)}
}

func since(years, months, days int) DateInterval {
	now := time.Now().UTC()
	return DateInterval{start: now.AddDate(years, months, days).Format(time.RFC3339), end: now.Format(time.RFC3339)}
}

// TopTracks returns the platform-wide top tracks chart over the given interval.
// Pass AllTime() for the all-time chart.
func (c *Client) TopTracksInterval(ctx context.Context, limit, offset int, interval DateInterval) ([]gen.SongViewBasic, error) {
	var out tracksOut
	err := c.query(ctx, "app.rocksky.charts.getTopTracks",
		map[string]any{"limit": limit, "offset": offset, "startDate": interval.start, "endDate": interval.end}, &out)
	return out.Tracks, err
}

// TopArtistsInterval returns the platform-wide top artists chart over the interval.
func (c *Client) TopArtistsInterval(ctx context.Context, limit, offset int, interval DateInterval) ([]gen.ArtistViewBasic, error) {
	var out artistsOut
	err := c.query(ctx, "app.rocksky.charts.getTopArtists",
		map[string]any{"limit": limit, "offset": offset, "startDate": interval.start, "endDate": interval.end}, &out)
	return out.Artists, err
}

// ---- raw-JSON long tail -------------------------------------------------
//
// Bespoke shapes returned verbatim as json.RawMessage; unmarshal as you like.

// Album returns a single album with its tracklist.
func (c *Client) Album(ctx context.Context, uri string) (json.RawMessage, error) {
	return c.Get(ctx, "app.rocksky.album.getAlbum", map[string]any{"uri": uri})
}

// Artist returns a single artist with detail.
func (c *Client) Artist(ctx context.Context, uri string) (json.RawMessage, error) {
	return c.Get(ctx, "app.rocksky.artist.getArtist", map[string]any{"uri": uri})
}

// MatchSong resolves full canonical metadata for a bare title + artist against
// Rocksky's database and external providers (app.rocksky.song.matchSong).
// Optionally anchor with mbId / isrc. This is what [Agent.ScrobbleMatch] uses.
func (c *Client) MatchSong(ctx context.Context, title, artist, mbID, isrc string) (json.RawMessage, error) {
	return c.Get(ctx, "app.rocksky.song.matchSong",
		map[string]any{"title": title, "artist": artist, "mbId": mbID, "isrc": isrc})
}

// Song returns a single song by at:// uri (or pass mbid/isrc/spotifyId).
func (c *Client) Song(ctx context.Context, uri, mbid, isrc, spotifyID string) (json.RawMessage, error) {
	return c.Get(ctx, "app.rocksky.song.getSong",
		map[string]any{"uri": uri, "mbid": mbid, "isrc": isrc, "spotifyId": spotifyID})
}

// ActorPlaylists returns an actor's playlists.
func (c *Client) ActorPlaylists(ctx context.Context, actor string, limit, offset int) (json.RawMessage, error) {
	return c.Get(ctx, "app.rocksky.actor.getActorPlaylists",
		map[string]any{"did": actor, "limit": limit, "offset": offset})
}

// Neighbours returns actors with similar taste to actor.
func (c *Client) Neighbours(ctx context.Context, actor string) (json.RawMessage, error) {
	return c.Get(ctx, "app.rocksky.actor.getActorNeighbours", map[string]any{"did": actor})
}

// Compatibility returns music compatibility between the viewer and actor (auth).
func (c *Client) Compatibility(ctx context.Context, actor string) (json.RawMessage, error) {
	return c.Get(ctx, "app.rocksky.actor.getActorCompatibility", map[string]any{"did": actor})
}

// ArtistListeners returns an artist's all-time listeners.
func (c *Client) ArtistListeners(ctx context.Context, uri string, limit, offset int) (json.RawMessage, error) {
	return c.Get(ctx, "app.rocksky.artist.getArtistListeners",
		map[string]any{"uri": uri, "limit": limit, "offset": offset})
}

// ArtistRecentListeners returns an artist's recent listeners.
func (c *Client) ArtistRecentListeners(ctx context.Context, uri string, limit, offset int) (json.RawMessage, error) {
	return c.Get(ctx, "app.rocksky.artist.getArtistRecentListeners",
		map[string]any{"uri": uri, "limit": limit, "offset": offset})
}

// SongRecentListeners returns a song's recent listeners.
func (c *Client) SongRecentListeners(ctx context.Context, uri string, limit, offset int) (json.RawMessage, error) {
	return c.Get(ctx, "app.rocksky.song.getSongRecentListeners",
		map[string]any{"uri": uri, "limit": limit, "offset": offset})
}

// ScrobblesChart returns a scrobble time-series chart. Scope with any of
// did/artistURI/albumURI/songURI/genre and bound with from/to (RFC-3339).
func (c *Client) ScrobblesChart(ctx context.Context, did, artistURI, albumURI, songURI, genre, from, to string) (json.RawMessage, error) {
	return c.Get(ctx, "app.rocksky.charts.getScrobblesChart", map[string]any{
		"did": did, "artisturi": artistURI, "albumuri": albumURI, "songuri": songURI,
		"genre": genre, "from": from, "to": to,
	})
}

// FeedGenerators lists the available feed generators.
func (c *Client) FeedGenerators(ctx context.Context, size int) (json.RawMessage, error) {
	return c.Get(ctx, "app.rocksky.feed.getFeedGenerators", map[string]any{"size": size})
}

// FeedGenerator returns a single feed generator's record.
func (c *Client) FeedGenerator(ctx context.Context, feed string) (json.RawMessage, error) {
	return c.Get(ctx, "app.rocksky.feed.getFeedGenerator", map[string]any{"feed": feed})
}

// Stories returns the stories row.
func (c *Client) Stories(ctx context.Context, size int, feed string, following bool) (json.RawMessage, error) {
	return c.Get(ctx, "app.rocksky.feed.getStories",
		map[string]any{"size": size, "feed": feed, "following": following})
}

// Recommendations returns track recommendations for actor.
func (c *Client) Recommendations(ctx context.Context, actor string, limit int) (json.RawMessage, error) {
	return c.Get(ctx, "app.rocksky.feed.getRecommendations", map[string]any{"did": actor, "limit": limit})
}

// ArtistRecommendations returns artist recommendations for actor.
func (c *Client) ArtistRecommendations(ctx context.Context, actor string, limit int) (json.RawMessage, error) {
	return c.Get(ctx, "app.rocksky.feed.getArtistRecommendations", map[string]any{"did": actor, "limit": limit})
}

// AlbumRecommendations returns album recommendations for actor.
func (c *Client) AlbumRecommendations(ctx context.Context, actor string, limit int) (json.RawMessage, error) {
	return c.Get(ctx, "app.rocksky.feed.getAlbumRecommendations", map[string]any{"did": actor, "limit": limit})
}

// Stats returns an actor's aggregate stats.
func (c *Client) Stats(ctx context.Context, actor string) (json.RawMessage, error) {
	return c.Get(ctx, "app.rocksky.stats.getStats", map[string]any{"did": actor})
}

// Wrapped returns an actor's year-in-review (year 0 = current).
func (c *Client) Wrapped(ctx context.Context, actor string, year int) (json.RawMessage, error) {
	params := map[string]any{"did": actor}
	if year != 0 {
		params["year"] = strconv.Itoa(year)
	}
	return c.Get(ctx, "app.rocksky.stats.getWrapped", params)
}

// MirrorSources returns the viewer's configured scrobble mirror sources (auth).
func (c *Client) MirrorSources(ctx context.Context) (json.RawMessage, error) {
	return c.Get(ctx, "app.rocksky.mirror.getMirrorSources", nil)
}

// CurrentlyPlaying returns what actor is playing now.
func (c *Client) CurrentlyPlaying(ctx context.Context, playerID, actor string) (json.RawMessage, error) {
	return c.Get(ctx, "app.rocksky.player.getCurrentlyPlaying",
		map[string]any{"playerId": playerID, "actor": actor})
}

// PlaybackQueue returns a player's playback queue.
func (c *Client) PlaybackQueue(ctx context.Context, playerID string) (json.RawMessage, error) {
	return c.Get(ctx, "app.rocksky.player.getPlaybackQueue", map[string]any{"playerId": playerID})
}

// SpotifyCurrentlyPlaying returns what actor is playing now on Spotify.
func (c *Client) SpotifyCurrentlyPlaying(ctx context.Context, actor string) (json.RawMessage, error) {
	return c.Get(ctx, "app.rocksky.spotify.getCurrentlyPlaying", map[string]any{"actor": actor})
}

// Playlists returns the playlist catalog.
func (c *Client) Playlists(ctx context.Context, limit, offset int) (json.RawMessage, error) {
	return c.Get(ctx, "app.rocksky.playlist.getPlaylists", map[string]any{"limit": limit, "offset": offset})
}

// Playlist returns a single playlist with its items.
func (c *Client) Playlist(ctx context.Context, uri string) (json.RawMessage, error) {
	return c.Get(ctx, "app.rocksky.playlist.getPlaylist", map[string]any{"uri": uri})
}

// AlbumShouts returns shouts on an album.
func (c *Client) AlbumShouts(ctx context.Context, uri string, limit, offset int) (json.RawMessage, error) {
	return c.Get(ctx, "app.rocksky.shout.getAlbumShouts", map[string]any{"uri": uri, "limit": limit, "offset": offset})
}

// ArtistShouts returns shouts on an artist.
func (c *Client) ArtistShouts(ctx context.Context, uri string, limit, offset int) (json.RawMessage, error) {
	return c.Get(ctx, "app.rocksky.shout.getArtistShouts", map[string]any{"uri": uri, "limit": limit, "offset": offset})
}

// ProfileShouts returns shouts on a profile.
func (c *Client) ProfileShouts(ctx context.Context, actor string, limit, offset int) (json.RawMessage, error) {
	return c.Get(ctx, "app.rocksky.shout.getProfileShouts", map[string]any{"did": actor, "limit": limit, "offset": offset})
}

// TrackShouts returns shouts on a track.
func (c *Client) TrackShouts(ctx context.Context, uri string) (json.RawMessage, error) {
	return c.Get(ctx, "app.rocksky.shout.getTrackShouts", map[string]any{"uri": uri})
}

// ShoutReplies returns replies to a shout.
func (c *Client) ShoutReplies(ctx context.Context, uri string, limit, offset int) (json.RawMessage, error) {
	return c.Get(ctx, "app.rocksky.shout.getShoutReplies", map[string]any{"uri": uri, "limit": limit, "offset": offset})
}

// AudioSettings returns an actor's Rockbox EQ / audio settings.
func (c *Client) AudioSettings(ctx context.Context, actor string) (json.RawMessage, error) {
	return c.Get(ctx, "app.rocksky.rockbox.getAudioSettings", map[string]any{"did": actor})
}

// Apikeys returns the viewer's API keys (auth).
func (c *Client) Apikeys(ctx context.Context, limit, offset int) (json.RawMessage, error) {
	return c.Get(ctx, "app.rocksky.apikey.getApikeys", map[string]any{"limit": limit, "offset": offset})
}
