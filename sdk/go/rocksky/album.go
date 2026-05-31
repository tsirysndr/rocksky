package rocksky

import "context"

// AlbumService groups endpoints under app.rocksky.album.*.
type AlbumService struct{ c *Client }

// GetAlbumParams identifies the album by AT-URI.
type GetAlbumParams struct {
	URI string // app.rocksky.album AT-URI; required
}

// GetAlbum returns the detailed view of a single album.
// XRPC: app.rocksky.album.getAlbum.
func (s *AlbumService) GetAlbum(ctx context.Context, p GetAlbumParams) (*AlbumViewDetailed, error) {
	q := newQuery()
	q.setString("uri", p.URI)
	out := &AlbumViewDetailed{}
	if err := s.c.query(ctx, "app.rocksky.album.getAlbum", q.Values(), out); err != nil {
		return nil, err
	}
	return out, nil
}

// GetAlbumsParams paginates the global album catalog and optionally filters by genre.
type GetAlbumsParams struct {
	PaginationParams
	Genre string
}

// GetAlbumsResponse — output of app.rocksky.album.getAlbums.
type GetAlbumsResponse struct {
	Albums []AlbumViewBasic `json:"albums,omitempty"`
}

// GetAlbums returns a paginated list of albums.
func (s *AlbumService) GetAlbums(ctx context.Context, p GetAlbumsParams) (*GetAlbumsResponse, error) {
	q := newQuery()
	q.setInt("limit", p.Limit)
	q.setInt("offset", p.Offset)
	q.setString("genre", p.Genre)
	out := &GetAlbumsResponse{}
	if err := s.c.query(ctx, "app.rocksky.album.getAlbums", q.Values(), out); err != nil {
		return nil, err
	}
	return out, nil
}

// GetAlbumTracksParams identifies the album whose tracks are being requested.
type GetAlbumTracksParams struct {
	URI string
	PaginationParams
}

// GetAlbumTracksResponse — output of app.rocksky.album.getAlbumTracks.
type GetAlbumTracksResponse struct {
	Tracks []SongViewBasic `json:"tracks,omitempty"`
}

// GetAlbumTracks lists the songs that make up an album.
func (s *AlbumService) GetAlbumTracks(ctx context.Context, p GetAlbumTracksParams) (*GetAlbumTracksResponse, error) {
	q := newQuery()
	q.setString("uri", p.URI)
	q.setInt("limit", p.Limit)
	q.setInt("offset", p.Offset)
	out := &GetAlbumTracksResponse{}
	if err := s.c.query(ctx, "app.rocksky.album.getAlbumTracks", q.Values(), out); err != nil {
		return nil, err
	}
	return out, nil
}
