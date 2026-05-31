package rocksky

import "context"

// SongService groups endpoints under app.rocksky.song.*.
type SongService struct{ c *Client }

// GetSongParams identifies a single song. Exactly one of URI, MBID, ISRC or
// SpotifyID should be supplied.
type GetSongParams struct {
	URI       string
	MBID      string
	ISRC      string
	SpotifyID string
}

// GetSong returns the detailed view of a song by AT-URI, MusicBrainz ID,
// ISRC or Spotify track ID.
// XRPC: app.rocksky.song.getSong.
func (s *SongService) GetSong(ctx context.Context, p GetSongParams) (*SongViewDetailed, error) {
	q := newQuery()
	q.setString("uri", p.URI)
	q.setString("mbid", p.MBID)
	q.setString("isrc", p.ISRC)
	q.setString("spotifyId", p.SpotifyID)
	out := &SongViewDetailed{}
	if err := s.c.query(ctx, "app.rocksky.song.getSong", q.Values(), out); err != nil {
		return nil, err
	}
	return out, nil
}

// GetSongsParams paginates the global song catalog.
type GetSongsParams struct {
	PaginationParams
	Genre string
}

// GetSongsResponse — output of app.rocksky.song.getSongs.
type GetSongsResponse struct {
	Songs []SongViewBasic `json:"songs,omitempty"`
}

// GetSongs returns a paginated list of songs.
func (s *SongService) GetSongs(ctx context.Context, p GetSongsParams) (*GetSongsResponse, error) {
	q := newQuery()
	q.setInt("limit", p.Limit)
	q.setInt("offset", p.Offset)
	q.setString("genre", p.Genre)
	out := &GetSongsResponse{}
	if err := s.c.query(ctx, "app.rocksky.song.getSongs", q.Values(), out); err != nil {
		return nil, err
	}
	return out, nil
}

// GetSongRecentListenersParams identifies the song to query.
type GetSongRecentListenersParams struct {
	URI string
	PaginationParams
}

// GetSongRecentListenersResponse — output of app.rocksky.song.getSongRecentListeners.
type GetSongRecentListenersResponse struct {
	Listeners []RecentListenerView `json:"listeners,omitempty"`
}

// GetSongRecentListeners returns the most recent scrobblers of a song.
func (s *SongService) GetSongRecentListeners(ctx context.Context, p GetSongRecentListenersParams) (*GetSongRecentListenersResponse, error) {
	q := newQuery()
	q.setString("uri", p.URI)
	q.setInt("limit", p.Limit)
	q.setInt("offset", p.Offset)
	out := &GetSongRecentListenersResponse{}
	if err := s.c.query(ctx, "app.rocksky.song.getSongRecentListeners", q.Values(), out); err != nil {
		return nil, err
	}
	return out, nil
}

// MatchSongParams describes the song to match.
type MatchSongParams struct {
	Title       string
	Artist      string
	Album       string
	MBID        string
	ISRC        string
	DurationMs  int
}

// MatchSong attempts to resolve a free-form track description to a canonical
// Rocksky song record. XRPC: app.rocksky.song.matchSong.
func (s *SongService) MatchSong(ctx context.Context, p MatchSongParams) (*SongViewBasic, error) {
	q := newQuery()
	q.setString("title", p.Title)
	q.setString("artist", p.Artist)
	q.setString("album", p.Album)
	q.setString("mbid", p.MBID)
	q.setString("isrc", p.ISRC)
	q.setInt("durationMs", p.DurationMs)
	out := &SongViewBasic{}
	if err := s.c.query(ctx, "app.rocksky.song.matchSong", q.Values(), out); err != nil {
		return nil, err
	}
	return out, nil
}
