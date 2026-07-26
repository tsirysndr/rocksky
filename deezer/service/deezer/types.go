package deezer

// This file mirrors the shape of the public Deezer API
// (https://developers.deezer.com/api). Only the fields we consume are
// modeled; unknown fields are ignored by the JSON decoder.

// DeezerArtist is the artist object returned by the Deezer API. The picture
// fields are only populated on the full artist endpoint (/artist/{id}) and on
// the artist embedded in a full track object.
type DeezerArtist struct {
	ID            int64  `json:"id"`
	Name          string `json:"name"`
	Link          string `json:"link,omitempty"`
	Picture       string `json:"picture,omitempty"`
	PictureSmall  string `json:"picture_small,omitempty"`
	PictureMedium string `json:"picture_medium,omitempty"`
	PictureBig    string `json:"picture_big,omitempty"`
	PictureXL     string `json:"picture_xl,omitempty"`
}

// DeezerGenre is a single genre entry.
type DeezerGenre struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

// DeezerGenres wraps the genre list on the full album endpoint.
type DeezerGenres struct {
	Data []DeezerGenre `json:"data"`
}

// DeezerAlbum is the album object returned by the Deezer API. Label, genres and
// UPC are only populated on the full album endpoint (/album/{id}).
type DeezerAlbum struct {
	ID          int64        `json:"id"`
	Title       string       `json:"title"`
	Link        string       `json:"link,omitempty"`
	Cover       string       `json:"cover,omitempty"`
	CoverSmall  string       `json:"cover_small,omitempty"`
	CoverMedium string       `json:"cover_medium,omitempty"`
	CoverBig    string       `json:"cover_big,omitempty"`
	CoverXL     string       `json:"cover_xl,omitempty"`
	ReleaseDate string       `json:"release_date,omitempty"`
	Tracklist   string       `json:"tracklist,omitempty"`
	Label       string       `json:"label,omitempty"`
	UPC         string       `json:"upc,omitempty"`
	NbTracks    int          `json:"nb_tracks,omitempty"`
	Genres      DeezerGenres `json:"genres,omitempty"`
}

// DeezerTrack is the track object returned by the Deezer API. ISRC,
// track_position, disk_number, release_date, bpm and contributors are only
// populated on the full track endpoint (/track/{id}).
type DeezerTrack struct {
	ID             int64          `json:"id"`
	Title          string         `json:"title"`
	TitleShort     string         `json:"title_short,omitempty"`
	TitleVersion   string         `json:"title_version,omitempty"`
	ISRC           string         `json:"isrc,omitempty"`
	Link           string         `json:"link,omitempty"`
	Duration       int            `json:"duration,omitempty"` // seconds
	Rank           int            `json:"rank,omitempty"`
	TrackPosition  int            `json:"track_position,omitempty"`
	DiskNumber     int            `json:"disk_number,omitempty"`
	ReleaseDate    string         `json:"release_date,omitempty"`
	ExplicitLyrics bool           `json:"explicit_lyrics,omitempty"`
	Preview        string         `json:"preview,omitempty"`
	BPM            float64        `json:"bpm,omitempty"`
	Gain           float64        `json:"gain,omitempty"`
	Contributors   []DeezerArtist `json:"contributors,omitempty"`
	Artist         DeezerArtist   `json:"artist"`
	Album          DeezerAlbum    `json:"album"`
}

// DeezerSearchResponse is the envelope returned by /search.
type DeezerSearchResponse struct {
	Data  []DeezerTrack `json:"data"`
	Total int           `json:"total"`
	Next  string        `json:"next,omitempty"`
}

// DeezerAPIError is the error envelope Deezer returns (with HTTP 200) when a
// request is invalid or the quota is exceeded.
type DeezerAPIError struct {
	Error *struct {
		Type    string `json:"type"`
		Message string `json:"message"`
		Code    int    `json:"code"`
	} `json:"error,omitempty"`
}

// SearchParams are the inputs accepted by the enrichment endpoints.
type SearchParams struct {
	Title  string `json:"title"`
	Artist string `json:"artist"`
	Album  string `json:"album,omitempty"`
}

// Match is a lightweight, ranked candidate returned to callers alongside the
// enriched track. Duration is expressed in milliseconds to match the rest of
// the Rocksky pipeline. TrackNumber and DiscNumber are only populated after a
// deep-fetch of the full track (the /search endpoint omits them).
type Match struct {
	ID          int64   `json:"id"`
	Title       string  `json:"title"`
	Artist      string  `json:"artist"`
	Album       string  `json:"album"`
	AlbumArt    string  `json:"albumArt,omitempty"`
	ISRC        string  `json:"isrc,omitempty"`
	DurationMs  int64   `json:"durationMs"`
	TrackNumber int     `json:"trackNumber,omitempty"`
	DiscNumber  int     `json:"discNumber,omitempty"`
	Link        string  `json:"link,omitempty"`
	Preview     string  `json:"preview,omitempty"`
	Rank        int     `json:"rank,omitempty"`
	Explicit    bool    `json:"explicit,omitempty"`
	Score       float64 `json:"score"`
}

// EnrichedTrack is the fully hydrated, normalized track metadata returned to
// callers. All durations are in milliseconds.
type EnrichedTrack struct {
	Title          string   `json:"title"`
	Artist         string   `json:"artist"`
	AlbumArtist    string   `json:"albumArtist,omitempty"`
	Album          string   `json:"album"`
	AlbumArt       string   `json:"albumArt,omitempty"`
	ISRC           string   `json:"isrc,omitempty"`
	UPC            string   `json:"upc,omitempty"`
	DurationMs     int64    `json:"durationMs"`
	TrackNumber    int      `json:"trackNumber,omitempty"`
	DiscNumber     int      `json:"discNumber,omitempty"`
	ReleaseDate    string   `json:"releaseDate,omitempty"`
	Year           int      `json:"year,omitempty"`
	Label          string   `json:"label,omitempty"`
	Genres         []string `json:"genres,omitempty"`
	ArtistPicture  string   `json:"artistPicture,omitempty"`
	DeezerLink     string   `json:"deezerLink,omitempty"`
	Preview        string   `json:"preview,omitempty"`
	Explicit       bool     `json:"explicit,omitempty"`
	DeezerTrackID  int64    `json:"deezerTrackId,omitempty"`
	DeezerAlbumID  int64    `json:"deezerAlbumId,omitempty"`
	DeezerArtistID int64    `json:"deezerArtistId,omitempty"`
}

// EnrichResponse is the payload returned by the /enrich and /search endpoints:
// the best enriched track (nil when there is no match) plus the ranked list of
// candidate matches.
type EnrichResponse struct {
	Track   *EnrichedTrack `json:"track"`
	Matches []Match        `json:"matches"`
}
