package rocksky

import "context"

// StatsService groups endpoints under app.rocksky.stats.*.
type StatsService struct{ c *Client }

// GetStatsParams identifies the user whose totals are returned.
type GetStatsParams struct {
	Actor string // handle or DID, required
}

// GetStats returns aggregate counters (total scrobbles, distinct artists, etc.).
// XRPC: app.rocksky.stats.getStats.
func (s *StatsService) GetStats(ctx context.Context, p GetStatsParams) (*StatsView, error) {
	q := newQuery()
	q.setString("did", p.Actor)
	out := &StatsView{}
	if err := s.c.query(ctx, "app.rocksky.stats.getStats", q.Values(), out); err != nil {
		return nil, err
	}
	return out, nil
}

// GetWrappedParams selects the year to summarize.
type GetWrappedParams struct {
	Actor string // handle or DID, required
	Year  int    // 0 means the most recent full year
}

// GetWrapped returns the year-end recap for a user.
// XRPC: app.rocksky.stats.getWrapped.
func (s *StatsService) GetWrapped(ctx context.Context, p GetWrappedParams) (*WrappedView, error) {
	q := newQuery()
	q.setString("did", p.Actor)
	q.setInt("year", p.Year)
	out := &WrappedView{}
	if err := s.c.query(ctx, "app.rocksky.stats.getWrapped", q.Values(), out); err != nil {
		return nil, err
	}
	return out, nil
}
