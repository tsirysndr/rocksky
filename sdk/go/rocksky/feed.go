package rocksky

import "context"

// FeedService groups endpoints under app.rocksky.feed.*.
type FeedService struct{ c *Client }

// SearchParams holds the free-text search query.
type SearchParams struct {
	Query string // required
}

// Search runs a global search across songs, albums, artists, playlists and users.
// XRPC: app.rocksky.feed.search.
func (s *FeedService) Search(ctx context.Context, p SearchParams) (*SearchResultsView, error) {
	q := newQuery()
	q.setString("query", p.Query)
	out := &SearchResultsView{}
	if err := s.c.query(ctx, "app.rocksky.feed.search", q.Values(), out); err != nil {
		return nil, err
	}
	return out, nil
}

// CursorPagination is the cursor-based pagination used by feed endpoints.
type CursorPagination struct {
	Limit  int
	Cursor string
}

// GetFeedParams identifies which feed to read.
type GetFeedParams struct {
	Feed string // AT-URI of the feed generator
	CursorPagination
}

// GetFeedResponse — output of app.rocksky.feed.getFeed.
type GetFeedResponse struct {
	Feed   []FeedItemView `json:"feed,omitempty"`
	Cursor string         `json:"cursor,omitempty"`
}

// GetFeed pulls items from a specific feed generator.
func (s *FeedService) GetFeed(ctx context.Context, p GetFeedParams) (*GetFeedResponse, error) {
	q := newQuery()
	q.setString("feed", p.Feed)
	q.setInt("limit", p.Limit)
	q.setString("cursor", p.Cursor)
	out := &GetFeedResponse{}
	if err := s.c.query(ctx, "app.rocksky.feed.getFeed", q.Values(), out); err != nil {
		return nil, err
	}
	return out, nil
}

// GetStoriesResponse — output of app.rocksky.feed.getStories.
type GetStoriesResponse struct {
	Stories []StoryView `json:"stories,omitempty"`
}

// GetStories returns the "stories" feed (recent listening activity from people you follow).
// Requires an authenticated client.
func (s *FeedService) GetStories(ctx context.Context) (*GetStoriesResponse, error) {
	out := &GetStoriesResponse{}
	if err := s.c.query(ctx, "app.rocksky.feed.getStories", nil, out); err != nil {
		return nil, err
	}
	return out, nil
}

// GetRecommendationsResponse — output of app.rocksky.feed.getRecommendations.
type GetRecommendationsResponse struct {
	Recommendations []RecommendationView `json:"recommendations,omitempty"`
	Cursor          string               `json:"cursor,omitempty"`
}

// GetRecommendations returns personalized track recommendations.
func (s *FeedService) GetRecommendations(ctx context.Context, p CursorPagination) (*GetRecommendationsResponse, error) {
	q := newQuery()
	q.setInt("limit", p.Limit)
	q.setString("cursor", p.Cursor)
	out := &GetRecommendationsResponse{}
	if err := s.c.query(ctx, "app.rocksky.feed.getRecommendations", q.Values(), out); err != nil {
		return nil, err
	}
	return out, nil
}

// GetArtistRecommendationsResponse — output of app.rocksky.feed.getArtistRecommendations.
type GetArtistRecommendationsResponse struct {
	Artists []RecommendedArtistView `json:"artists,omitempty"`
	Cursor  string                  `json:"cursor,omitempty"`
}

// GetArtistRecommendations returns personalized artist recommendations.
func (s *FeedService) GetArtistRecommendations(ctx context.Context, p CursorPagination) (*GetArtistRecommendationsResponse, error) {
	q := newQuery()
	q.setInt("limit", p.Limit)
	q.setString("cursor", p.Cursor)
	out := &GetArtistRecommendationsResponse{}
	if err := s.c.query(ctx, "app.rocksky.feed.getArtistRecommendations", q.Values(), out); err != nil {
		return nil, err
	}
	return out, nil
}

// GetAlbumRecommendationsResponse — output of app.rocksky.feed.getAlbumRecommendations.
type GetAlbumRecommendationsResponse struct {
	Albums []RecommendedAlbumView `json:"albums,omitempty"`
	Cursor string                 `json:"cursor,omitempty"`
}

// GetAlbumRecommendations returns personalized album recommendations.
func (s *FeedService) GetAlbumRecommendations(ctx context.Context, p CursorPagination) (*GetAlbumRecommendationsResponse, error) {
	q := newQuery()
	q.setInt("limit", p.Limit)
	q.setString("cursor", p.Cursor)
	out := &GetAlbumRecommendationsResponse{}
	if err := s.c.query(ctx, "app.rocksky.feed.getAlbumRecommendations", q.Values(), out); err != nil {
		return nil, err
	}
	return out, nil
}
