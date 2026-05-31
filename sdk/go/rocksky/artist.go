package rocksky

import "context"

// ArtistService groups endpoints under app.rocksky.artist.*.
type ArtistService struct{ c *Client }

// GetArtistParams identifies an artist by AT-URI.
type GetArtistParams struct {
	URI string // required
}

// GetArtist returns the detailed view of a single artist.
// XRPC: app.rocksky.artist.getArtist.
func (s *ArtistService) GetArtist(ctx context.Context, p GetArtistParams) (*ArtistViewDetailed, error) {
	q := newQuery()
	q.setString("uri", p.URI)
	out := &ArtistViewDetailed{}
	if err := s.c.query(ctx, "app.rocksky.artist.getArtist", q.Values(), out); err != nil {
		return nil, err
	}
	return out, nil
}

// GetArtistsParams paginates the global artist catalog.
type GetArtistsParams struct {
	PaginationParams
	Genre string
}

// GetArtistsResponse — output of app.rocksky.artist.getArtists.
type GetArtistsResponse struct {
	Artists []ArtistViewBasic `json:"artists,omitempty"`
}

// GetArtists returns a paginated list of artists.
func (s *ArtistService) GetArtists(ctx context.Context, p GetArtistsParams) (*GetArtistsResponse, error) {
	q := newQuery()
	q.setInt("limit", p.Limit)
	q.setInt("offset", p.Offset)
	q.setString("genre", p.Genre)
	out := &GetArtistsResponse{}
	if err := s.c.query(ctx, "app.rocksky.artist.getArtists", q.Values(), out); err != nil {
		return nil, err
	}
	return out, nil
}

// ArtistURIParams identifies an artist by AT-URI for list-style endpoints.
type ArtistURIParams struct {
	URI string
	PaginationParams
}

// GetArtistAlbumsResponse — output of app.rocksky.artist.getArtistAlbums.
type GetArtistAlbumsResponse struct {
	Albums []AlbumViewBasic `json:"albums,omitempty"`
}

// GetArtistAlbums lists albums released by an artist.
func (s *ArtistService) GetArtistAlbums(ctx context.Context, p ArtistURIParams) (*GetArtistAlbumsResponse, error) {
	q := newQuery()
	q.setString("uri", p.URI)
	q.setInt("limit", p.Limit)
	q.setInt("offset", p.Offset)
	out := &GetArtistAlbumsResponse{}
	if err := s.c.query(ctx, "app.rocksky.artist.getArtistAlbums", q.Values(), out); err != nil {
		return nil, err
	}
	return out, nil
}

// GetArtistTracksResponse — output of app.rocksky.artist.getArtistTracks.
type GetArtistTracksResponse struct {
	Tracks []SongViewBasic `json:"tracks,omitempty"`
}

// GetArtistTracks lists tracks by an artist (ordered by play count).
func (s *ArtistService) GetArtistTracks(ctx context.Context, p ArtistURIParams) (*GetArtistTracksResponse, error) {
	q := newQuery()
	q.setString("uri", p.URI)
	q.setInt("limit", p.Limit)
	q.setInt("offset", p.Offset)
	out := &GetArtistTracksResponse{}
	if err := s.c.query(ctx, "app.rocksky.artist.getArtistTracks", q.Values(), out); err != nil {
		return nil, err
	}
	return out, nil
}

// GetArtistListenersResponse — output of app.rocksky.artist.getArtistListeners.
type GetArtistListenersResponse struct {
	Listeners []ListenerViewBasic `json:"listeners,omitempty"`
}

// GetArtistListeners returns the top listeners for an artist (by total plays).
func (s *ArtistService) GetArtistListeners(ctx context.Context, p ArtistURIParams) (*GetArtistListenersResponse, error) {
	q := newQuery()
	q.setString("uri", p.URI)
	q.setInt("limit", p.Limit)
	q.setInt("offset", p.Offset)
	out := &GetArtistListenersResponse{}
	if err := s.c.query(ctx, "app.rocksky.artist.getArtistListeners", q.Values(), out); err != nil {
		return nil, err
	}
	return out, nil
}

// GetArtistRecentListenersResponse — output of app.rocksky.artist.getArtistRecentListeners.
type GetArtistRecentListenersResponse struct {
	Listeners []RecentListenerView `json:"listeners,omitempty"`
}

// GetArtistRecentListeners returns the most recent scrobblers of an artist.
func (s *ArtistService) GetArtistRecentListeners(ctx context.Context, p ArtistURIParams) (*GetArtistRecentListenersResponse, error) {
	q := newQuery()
	q.setString("uri", p.URI)
	q.setInt("limit", p.Limit)
	q.setInt("offset", p.Offset)
	out := &GetArtistRecentListenersResponse{}
	if err := s.c.query(ctx, "app.rocksky.artist.getArtistRecentListeners", q.Values(), out); err != nil {
		return nil, err
	}
	return out, nil
}
