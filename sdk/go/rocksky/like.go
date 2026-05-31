package rocksky

import "context"

// LikeService groups endpoints under app.rocksky.like.*.
// All four mutators require an authenticated bearer token.
type LikeService struct{ c *Client }

type likeInput struct {
	URI string `json:"uri"`
}

// LikeSong marks a song as loved by the authenticated user.
// XRPC: app.rocksky.like.likeSong.
func (s *LikeService) LikeSong(ctx context.Context, songURI string) (*SongViewDetailed, error) {
	out := &SongViewDetailed{}
	if err := s.c.procedure(ctx, "app.rocksky.like.likeSong", nil, likeInput{URI: songURI}, out); err != nil {
		return nil, err
	}
	return out, nil
}

// DislikeSong removes a previous like for a song.
// XRPC: app.rocksky.like.dislikeSong.
func (s *LikeService) DislikeSong(ctx context.Context, songURI string) (*SongViewDetailed, error) {
	out := &SongViewDetailed{}
	if err := s.c.procedure(ctx, "app.rocksky.like.dislikeSong", nil, likeInput{URI: songURI}, out); err != nil {
		return nil, err
	}
	return out, nil
}

// LikeShout marks a shout as liked by the authenticated user.
// XRPC: app.rocksky.like.likeShout.
func (s *LikeService) LikeShout(ctx context.Context, shoutURI string) error {
	return s.c.procedure(ctx, "app.rocksky.like.likeShout", nil, likeInput{URI: shoutURI}, nil)
}

// DislikeShout removes a previous like for a shout.
// XRPC: app.rocksky.like.dislikeShout.
func (s *LikeService) DislikeShout(ctx context.Context, shoutURI string) error {
	return s.c.procedure(ctx, "app.rocksky.like.dislikeShout", nil, likeInput{URI: shoutURI}, nil)
}
