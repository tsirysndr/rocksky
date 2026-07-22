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
	"strings"

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
	var out gen.GetActorSongsOutput
	err := c.query(ctx, "app.rocksky.actor.getActorSongs",
		map[string]any{"did": actor, "limit": limit, "offset": offset}, &out)
	return out.Songs, err
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
