package rocksky

import "context"

// ShoutService groups endpoints under app.rocksky.shout.*.
type ShoutService struct{ c *Client }

// CreateShoutInput is the body of app.rocksky.shout.createShout.
type CreateShoutInput struct {
	Message string `json:"message"`
}

// CreateShout posts a new shout from the authenticated user.
// XRPC: app.rocksky.shout.createShout. Requires a bearer token.
func (s *ShoutService) CreateShout(ctx context.Context, in CreateShoutInput) (*ShoutView, error) {
	out := &ShoutView{}
	if err := s.c.procedure(ctx, "app.rocksky.shout.createShout", nil, in, out); err != nil {
		return nil, err
	}
	return out, nil
}

// ReplyShoutInput is the body of app.rocksky.shout.replyShout.
type ReplyShoutInput struct {
	Parent  string `json:"parent"` // AT-URI of the shout being replied to
	Message string `json:"message"`
}

// ReplyShout posts a reply to an existing shout. Requires a bearer token.
// XRPC: app.rocksky.shout.replyShout.
func (s *ShoutService) ReplyShout(ctx context.Context, in ReplyShoutInput) (*ShoutView, error) {
	out := &ShoutView{}
	if err := s.c.procedure(ctx, "app.rocksky.shout.replyShout", nil, in, out); err != nil {
		return nil, err
	}
	return out, nil
}

// RemoveShout deletes a shout authored by the authenticated user.
// XRPC: app.rocksky.shout.removeShout. Requires a bearer token.
func (s *ShoutService) RemoveShout(ctx context.Context, uri string) error {
	return s.c.procedure(ctx, "app.rocksky.shout.removeShout", nil, map[string]string{"uri": uri}, nil)
}

// ReportShoutInput is the body of app.rocksky.shout.reportShout.
type ReportShoutInput struct {
	URI    string `json:"uri"`
	Reason string `json:"reason,omitempty"`
}

// ReportShout flags a shout for moderation. Requires a bearer token.
// XRPC: app.rocksky.shout.reportShout.
func (s *ShoutService) ReportShout(ctx context.Context, in ReportShoutInput) error {
	return s.c.procedure(ctx, "app.rocksky.shout.reportShout", nil, in, nil)
}

// GetShoutsResponse is the common output shape for shout list endpoints.
type GetShoutsResponse struct {
	Shouts []ShoutView `json:"shouts,omitempty"`
}

// ShoutTargetParams identifies the shout subject by AT-URI.
type ShoutTargetParams struct {
	URI string
	PaginationParams
}

// GetTrackShouts returns the shouts attached to a track.
func (s *ShoutService) GetTrackShouts(ctx context.Context, p ShoutTargetParams) (*GetShoutsResponse, error) {
	q := newQuery()
	q.setString("uri", p.URI)
	q.setInt("limit", p.Limit)
	q.setInt("offset", p.Offset)
	out := &GetShoutsResponse{}
	if err := s.c.query(ctx, "app.rocksky.shout.getTrackShouts", q.Values(), out); err != nil {
		return nil, err
	}
	return out, nil
}

// GetAlbumShouts returns the shouts attached to an album.
func (s *ShoutService) GetAlbumShouts(ctx context.Context, p ShoutTargetParams) (*GetShoutsResponse, error) {
	q := newQuery()
	q.setString("uri", p.URI)
	q.setInt("limit", p.Limit)
	q.setInt("offset", p.Offset)
	out := &GetShoutsResponse{}
	if err := s.c.query(ctx, "app.rocksky.shout.getAlbumShouts", q.Values(), out); err != nil {
		return nil, err
	}
	return out, nil
}

// GetArtistShouts returns the shouts attached to an artist.
func (s *ShoutService) GetArtistShouts(ctx context.Context, p ShoutTargetParams) (*GetShoutsResponse, error) {
	q := newQuery()
	q.setString("uri", p.URI)
	q.setInt("limit", p.Limit)
	q.setInt("offset", p.Offset)
	out := &GetShoutsResponse{}
	if err := s.c.query(ctx, "app.rocksky.shout.getArtistShouts", q.Values(), out); err != nil {
		return nil, err
	}
	return out, nil
}

// GetProfileShoutsParams identifies the profile.
type GetProfileShoutsParams struct {
	Actor string
	PaginationParams
}

// GetProfileShouts returns the shouts posted on an actor's profile.
func (s *ShoutService) GetProfileShouts(ctx context.Context, p GetProfileShoutsParams) (*GetShoutsResponse, error) {
	q := newQuery()
	q.setString("did", p.Actor)
	q.setInt("limit", p.Limit)
	q.setInt("offset", p.Offset)
	out := &GetShoutsResponse{}
	if err := s.c.query(ctx, "app.rocksky.shout.getProfileShouts", q.Values(), out); err != nil {
		return nil, err
	}
	return out, nil
}

// GetShoutReplies returns the replies to a parent shout.
func (s *ShoutService) GetShoutReplies(ctx context.Context, p ShoutTargetParams) (*GetShoutsResponse, error) {
	q := newQuery()
	q.setString("uri", p.URI)
	q.setInt("limit", p.Limit)
	q.setInt("offset", p.Offset)
	out := &GetShoutsResponse{}
	if err := s.c.query(ctx, "app.rocksky.shout.getShoutReplies", q.Values(), out); err != nil {
		return nil, err
	}
	return out, nil
}
