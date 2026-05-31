package rocksky

import "context"

// ScrobbleService groups endpoints under app.rocksky.scrobble.*.
type ScrobbleService struct{ c *Client }

// CreateScrobbleInput is the body of app.rocksky.scrobble.createScrobble.
// Title and Artist are required; everything else is optional metadata that
// improves matching against the canonical Rocksky catalog.
type CreateScrobbleInput struct {
	Title            string `json:"title"`
	Artist           string `json:"artist"`
	Album            string `json:"album,omitempty"`
	Duration         int    `json:"duration,omitempty"` // milliseconds
	MBID             string `json:"mbId,omitempty"`
	ISRC             string `json:"isrc,omitempty"`
	AlbumArt         string `json:"albumArt,omitempty"`
	TrackNumber      int    `json:"trackNumber,omitempty"`
	ReleaseDate      string `json:"releaseDate,omitempty"`
	Year             int    `json:"year,omitempty"`
	DiscNumber       int    `json:"discNumber,omitempty"`
	Lyrics           string `json:"lyrics,omitempty"`
	Composer         string `json:"composer,omitempty"`
	CopyrightMessage string `json:"copyrightMessage,omitempty"`
	Label            string `json:"label,omitempty"`
	ArtistPicture    string `json:"artistPicture,omitempty"`
	SpotifyLink      string `json:"spotifyLink,omitempty"`
	LastfmLink       string `json:"lastfmLink,omitempty"`
	TidalLink        string `json:"tidalLink,omitempty"`
	AppleMusicLink   string `json:"appleMusicLink,omitempty"`
	YoutubeLink      string `json:"youtubeLink,omitempty"`
	DeezerLink       string `json:"deezerLink,omitempty"`
	Timestamp        int64  `json:"timestamp,omitempty"` // Unix seconds; defaults to now on the server
}

// CreateScrobble records a play for the authenticated user.
// Requires a bearer token. XRPC: app.rocksky.scrobble.createScrobble.
func (s *ScrobbleService) CreateScrobble(ctx context.Context, in CreateScrobbleInput) (*ScrobbleViewBasic, error) {
	out := &ScrobbleViewBasic{}
	if err := s.c.procedure(ctx, "app.rocksky.scrobble.createScrobble", nil, in, out); err != nil {
		return nil, err
	}
	return out, nil
}

// GetScrobbleParams identifies a scrobble by AT-URI.
type GetScrobbleParams struct {
	URI string
}

// GetScrobble returns the detailed view of a single scrobble.
// XRPC: app.rocksky.scrobble.getScrobble.
func (s *ScrobbleService) GetScrobble(ctx context.Context, p GetScrobbleParams) (*ScrobbleViewDetailed, error) {
	q := newQuery()
	q.setString("uri", p.URI)
	out := &ScrobbleViewDetailed{}
	if err := s.c.query(ctx, "app.rocksky.scrobble.getScrobble", q.Values(), out); err != nil {
		return nil, err
	}
	return out, nil
}

// GetScrobblesParams filters the global scrobble feed.
type GetScrobblesParams struct {
	Actor     string // optional handle/DID; when empty returns the public feed
	Following bool   // when true and the client is authenticated, restrict to followed accounts
	PaginationParams
}

// GetScrobblesResponse — output of app.rocksky.scrobble.getScrobbles.
type GetScrobblesResponse struct {
	Scrobbles []ScrobbleViewBasic `json:"scrobbles,omitempty"`
}

// GetScrobbles returns the public (or followed-only) scrobble feed.
func (s *ScrobbleService) GetScrobbles(ctx context.Context, p GetScrobblesParams) (*GetScrobblesResponse, error) {
	q := newQuery()
	q.setString("did", p.Actor)
	q.setBool("following", p.Following)
	q.setInt("limit", p.Limit)
	q.setInt("offset", p.Offset)
	out := &GetScrobblesResponse{}
	if err := s.c.query(ctx, "app.rocksky.scrobble.getScrobbles", q.Values(), out); err != nil {
		return nil, err
	}
	return out, nil
}
