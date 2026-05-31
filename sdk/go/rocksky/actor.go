package rocksky

import "context"

// ActorService groups endpoints under app.rocksky.actor.*.
type ActorService struct{ c *Client }

// GetProfileParams selects which actor to return. Actor may be either a handle
// (e.g. "tsiry.bsky.social") or a DID (e.g. "did:plc:..."). When empty and the
// client is authenticated, the current user's profile is returned.
type GetProfileParams struct {
	Actor string
}

// GetProfile resolves an actor and returns their detailed Rocksky profile.
// XRPC: app.rocksky.actor.getProfile.
func (s *ActorService) GetProfile(ctx context.Context, p GetProfileParams) (*ProfileViewDetailed, error) {
	q := newQuery()
	q.setString("did", p.Actor)
	out := &ProfileViewDetailed{}
	if err := s.c.query(ctx, "app.rocksky.actor.getProfile", q.Values(), out); err != nil {
		return nil, err
	}
	return out, nil
}

// PaginationParams is shared by most list endpoints.
type PaginationParams struct {
	Limit  int
	Offset int
}

// ActorListParams is the common shape for actor-scoped list endpoints.
type ActorListParams struct {
	Actor string
	PaginationParams
}

// GetActorScrobblesResponse — output of app.rocksky.actor.getActorScrobbles.
type GetActorScrobblesResponse struct {
	Scrobbles []ScrobbleViewBasic `json:"scrobbles,omitempty"`
}

// GetActorScrobbles returns the scrobble history of an actor (most recent first).
func (s *ActorService) GetActorScrobbles(ctx context.Context, p ActorListParams) (*GetActorScrobblesResponse, error) {
	q := newQuery()
	q.setString("did", p.Actor)
	q.setInt("limit", p.Limit)
	q.setInt("offset", p.Offset)
	out := &GetActorScrobblesResponse{}
	if err := s.c.query(ctx, "app.rocksky.actor.getActorScrobbles", q.Values(), out); err != nil {
		return nil, err
	}
	return out, nil
}

// GetActorSongsResponse — output of app.rocksky.actor.getActorSongs.
type GetActorSongsResponse struct {
	Songs []SongViewBasic `json:"songs,omitempty"`
}

// GetActorSongs lists the songs an actor has scrobbled, ordered by play count.
func (s *ActorService) GetActorSongs(ctx context.Context, p ActorListParams) (*GetActorSongsResponse, error) {
	q := newQuery()
	q.setString("did", p.Actor)
	q.setInt("limit", p.Limit)
	q.setInt("offset", p.Offset)
	out := &GetActorSongsResponse{}
	if err := s.c.query(ctx, "app.rocksky.actor.getActorSongs", q.Values(), out); err != nil {
		return nil, err
	}
	return out, nil
}

// GetActorAlbumsResponse — output of app.rocksky.actor.getActorAlbums.
type GetActorAlbumsResponse struct {
	Albums []AlbumViewBasic `json:"albums,omitempty"`
}

// GetActorAlbums lists the albums an actor has scrobbled.
func (s *ActorService) GetActorAlbums(ctx context.Context, p ActorListParams) (*GetActorAlbumsResponse, error) {
	q := newQuery()
	q.setString("did", p.Actor)
	q.setInt("limit", p.Limit)
	q.setInt("offset", p.Offset)
	out := &GetActorAlbumsResponse{}
	if err := s.c.query(ctx, "app.rocksky.actor.getActorAlbums", q.Values(), out); err != nil {
		return nil, err
	}
	return out, nil
}

// GetActorArtistsResponse — output of app.rocksky.actor.getActorArtists.
type GetActorArtistsResponse struct {
	Artists []ArtistViewBasic `json:"artists,omitempty"`
}

// GetActorArtists lists the artists an actor has scrobbled.
func (s *ActorService) GetActorArtists(ctx context.Context, p ActorListParams) (*GetActorArtistsResponse, error) {
	q := newQuery()
	q.setString("did", p.Actor)
	q.setInt("limit", p.Limit)
	q.setInt("offset", p.Offset)
	out := &GetActorArtistsResponse{}
	if err := s.c.query(ctx, "app.rocksky.actor.getActorArtists", q.Values(), out); err != nil {
		return nil, err
	}
	return out, nil
}

// GetActorLovedSongsResponse — output of app.rocksky.actor.getActorLovedSongs.
type GetActorLovedSongsResponse struct {
	Songs []SongViewBasic `json:"songs,omitempty"`
}

// GetActorLovedSongs lists the songs an actor has marked as loved.
func (s *ActorService) GetActorLovedSongs(ctx context.Context, p ActorListParams) (*GetActorLovedSongsResponse, error) {
	q := newQuery()
	q.setString("did", p.Actor)
	q.setInt("limit", p.Limit)
	q.setInt("offset", p.Offset)
	out := &GetActorLovedSongsResponse{}
	if err := s.c.query(ctx, "app.rocksky.actor.getActorLovedSongs", q.Values(), out); err != nil {
		return nil, err
	}
	return out, nil
}
