package rocksky

import "context"

// ChartsService groups endpoints under app.rocksky.charts.*.
type ChartsService struct{ c *Client }

// GetScrobblesChartParams selects what to chart. All fields are optional —
// supplying none returns the global per-day chart for the last 6 months.
type GetScrobblesChartParams struct {
	Actor     string // handle or DID
	ArtistURI string
	AlbumURI  string
	SongURI   string
	Genre     string
	From      string // ISO 8601 date; defaults to 6 months ago
	To        string // ISO 8601 date; defaults to today
}

// GetScrobblesChartResponse — output of app.rocksky.charts.getScrobblesChart.
type GetScrobblesChartResponse struct {
	Scrobbles []ChartPoint `json:"scrobbles,omitempty"`
}

// GetScrobblesChart returns a time-series of scrobble counts.
func (s *ChartsService) GetScrobblesChart(ctx context.Context, p GetScrobblesChartParams) (*GetScrobblesChartResponse, error) {
	q := newQuery()
	q.setString("did", p.Actor)
	q.setString("artisturi", p.ArtistURI)
	q.setString("albumuri", p.AlbumURI)
	q.setString("songuri", p.SongURI)
	q.setString("genre", p.Genre)
	q.setString("from", p.From)
	q.setString("to", p.To)
	out := &GetScrobblesChartResponse{}
	if err := s.c.query(ctx, "app.rocksky.charts.getScrobblesChart", q.Values(), out); err != nil {
		return nil, err
	}
	return out, nil
}

// TopChartParams is shared by GetTopArtists and GetTopTracks. StartDate and
// EndDate are ISO 8601 timestamps; leaving them blank returns the all-time chart.
type TopChartParams struct {
	PaginationParams
	StartDate string
	EndDate   string
}

// GetTopArtistsResponse — output of app.rocksky.charts.getTopArtists.
type GetTopArtistsResponse struct {
	Artists []ArtistViewBasic `json:"artists,omitempty"`
}

// GetTopArtists returns the most-scrobbled artists, optionally bounded by a date range.
func (s *ChartsService) GetTopArtists(ctx context.Context, p TopChartParams) (*GetTopArtistsResponse, error) {
	q := newQuery()
	q.setInt("limit", p.Limit)
	q.setInt("offset", p.Offset)
	q.setString("startDate", p.StartDate)
	q.setString("endDate", p.EndDate)
	out := &GetTopArtistsResponse{}
	if err := s.c.query(ctx, "app.rocksky.charts.getTopArtists", q.Values(), out); err != nil {
		return nil, err
	}
	return out, nil
}

// GetTopTracksResponse — output of app.rocksky.charts.getTopTracks.
type GetTopTracksResponse struct {
	Tracks []SongViewBasic `json:"tracks,omitempty"`
}

// GetTopTracks returns the most-scrobbled tracks, optionally bounded by a date range.
func (s *ChartsService) GetTopTracks(ctx context.Context, p TopChartParams) (*GetTopTracksResponse, error) {
	q := newQuery()
	q.setInt("limit", p.Limit)
	q.setInt("offset", p.Offset)
	q.setString("startDate", p.StartDate)
	q.setString("endDate", p.EndDate)
	out := &GetTopTracksResponse{}
	if err := s.c.query(ctx, "app.rocksky.charts.getTopTracks", q.Values(), out); err != nil {
		return nil, err
	}
	return out, nil
}
