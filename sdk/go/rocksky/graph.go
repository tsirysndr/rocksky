package rocksky

import "context"

// GraphService groups endpoints under app.rocksky.graph.*.
type GraphService struct{ c *Client }

// GraphListParams paginates the followers / follows endpoints. DIDs, if set,
// filters the results to only the specified accounts (useful for batch lookups).
type GraphListParams struct {
	Actor  string   // required: handle or DID
	Limit  int      // 1..100, defaults server-side to 50
	Cursor string
	DIDs   []string
}

// FollowersResponse — output of app.rocksky.graph.getFollowers.
type FollowersResponse struct {
	Subject   ProfileViewBasic   `json:"subject"`
	Followers []ProfileViewBasic `json:"followers"`
	Cursor    string             `json:"cursor,omitempty"`
	Count     int                `json:"count,omitempty"`
}

// GetFollowers lists accounts following the given actor.
func (s *GraphService) GetFollowers(ctx context.Context, p GraphListParams) (*FollowersResponse, error) {
	q := newQuery()
	q.setString("actor", p.Actor)
	q.setInt("limit", p.Limit)
	q.setString("cursor", p.Cursor)
	q.addStrings("dids", p.DIDs)
	out := &FollowersResponse{}
	if err := s.c.query(ctx, "app.rocksky.graph.getFollowers", q.Values(), out); err != nil {
		return nil, err
	}
	return out, nil
}

// FollowsResponse — output of app.rocksky.graph.getFollows.
type FollowsResponse struct {
	Subject ProfileViewBasic   `json:"subject"`
	Follows []ProfileViewBasic `json:"follows"`
	Cursor  string             `json:"cursor,omitempty"`
	Count   int                `json:"count,omitempty"`
}

// GetFollows lists accounts the given actor follows.
func (s *GraphService) GetFollows(ctx context.Context, p GraphListParams) (*FollowsResponse, error) {
	q := newQuery()
	q.setString("actor", p.Actor)
	q.setInt("limit", p.Limit)
	q.setString("cursor", p.Cursor)
	q.addStrings("dids", p.DIDs)
	out := &FollowsResponse{}
	if err := s.c.query(ctx, "app.rocksky.graph.getFollows", q.Values(), out); err != nil {
		return nil, err
	}
	return out, nil
}

// KnownFollowersResponse — output of app.rocksky.graph.getKnownFollowers.
type KnownFollowersResponse struct {
	Subject   ProfileViewBasic   `json:"subject"`
	Followers []ProfileViewBasic `json:"followers"`
	Cursor    string             `json:"cursor,omitempty"`
}

// GetKnownFollowers returns followers of the target actor that the
// authenticated user also follows. Requires a bearer token.
func (s *GraphService) GetKnownFollowers(ctx context.Context, p GraphListParams) (*KnownFollowersResponse, error) {
	q := newQuery()
	q.setString("actor", p.Actor)
	q.setInt("limit", p.Limit)
	q.setString("cursor", p.Cursor)
	out := &KnownFollowersResponse{}
	if err := s.c.query(ctx, "app.rocksky.graph.getKnownFollowers", q.Values(), out); err != nil {
		return nil, err
	}
	return out, nil
}

// Follow creates a follow relationship from the authenticated user to account.
// Requires a bearer token. XRPC: app.rocksky.graph.followAccount.
func (s *GraphService) Follow(ctx context.Context, account string) (*FollowersResponse, error) {
	q := newQuery()
	q.setString("account", account)
	out := &FollowersResponse{}
	if err := s.c.procedure(ctx, "app.rocksky.graph.followAccount", q.Values(), nil, out); err != nil {
		return nil, err
	}
	return out, nil
}

// Unfollow removes a follow relationship from the authenticated user.
// Requires a bearer token. XRPC: app.rocksky.graph.unfollowAccount.
func (s *GraphService) Unfollow(ctx context.Context, account string) (*FollowersResponse, error) {
	q := newQuery()
	q.setString("account", account)
	out := &FollowersResponse{}
	if err := s.c.procedure(ctx, "app.rocksky.graph.unfollowAccount", q.Values(), nil, out); err != nil {
		return nil, err
	}
	return out, nil
}
