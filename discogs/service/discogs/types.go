package discogs

import (
	"bytes"
	"encoding/json"
	"time"
)

// This file mirrors the shape of the Discogs API
// (https://www.discogs.com/developers). Only the fields we consume are modeled.

// flexString tolerates fields Discogs returns as either "2013" or 2013.
type flexString string

func (f *flexString) UnmarshalJSON(b []byte) error {
	b = bytes.TrimSpace(b)
	if len(b) == 0 || string(b) == "null" {
		*f = ""
		return nil
	}
	if b[0] == '"' {
		var s string
		if err := json.Unmarshal(b, &s); err != nil {
			return err
		}
		*f = flexString(s)
		return nil
	}
	*f = flexString(b)
	return nil
}

func (f flexString) String() string { return string(f) }

type Pagination struct {
	Page    int `json:"page"`
	Pages   int `json:"pages"`
	PerPage int `json:"per_page"`
	Items   int `json:"items"`
}

type Community struct {
	Have   int `json:"have"`
	Want   int `json:"want"`
	Rating struct {
		Count   int     `json:"count"`
		Average float64 `json:"average"`
	} `json:"rating"`
}

// SearchResult is one entry from /database/search. For releases, Title is
// "Artist - Release Title".
type SearchResult struct {
	ID          int64      `json:"id"`
	MasterID    int64      `json:"master_id,omitempty"`
	Type        string     `json:"type,omitempty"`
	Title       string     `json:"title"`
	Year        flexString `json:"year,omitempty"`
	Country     string     `json:"country,omitempty"`
	Thumb       string     `json:"thumb,omitempty"`
	CoverImage  string     `json:"cover_image,omitempty"`
	URI         string     `json:"uri,omitempty"`
	ResourceURL string     `json:"resource_url,omitempty"`
	CatNo       string     `json:"catno,omitempty"`
	Format      []string   `json:"format,omitempty"`
	Label       []string   `json:"label,omitempty"`
	Genre       []string   `json:"genre,omitempty"`
	Style       []string   `json:"style,omitempty"`
	Barcode     []string   `json:"barcode,omitempty"`
	Community   Community  `json:"community,omitempty"`
}

type SearchResponse struct {
	Pagination Pagination     `json:"pagination"`
	Results    []SearchResult `json:"results"`
}

type ArtistCredit struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	ANV         string `json:"anv,omitempty"`
	Join        string `json:"join,omitempty"`
	Role        string `json:"role,omitempty"`
	Tracks      string `json:"tracks,omitempty"`
	ResourceURL string `json:"resource_url,omitempty"`
}

type LabelRef struct {
	ID             int64  `json:"id"`
	Name           string `json:"name"`
	CatNo          string `json:"catno,omitempty"`
	EntityType     string `json:"entity_type,omitempty"`
	EntityTypeName string `json:"entity_type_name,omitempty"`
	ResourceURL    string `json:"resource_url,omitempty"`
}

type Format struct {
	Name         string   `json:"name"`
	Qty          string   `json:"qty,omitempty"`
	Text         string   `json:"text,omitempty"`
	Descriptions []string `json:"descriptions,omitempty"`
}

type Image struct {
	Type        string `json:"type,omitempty"`
	URI         string `json:"uri,omitempty"`
	URI150      string `json:"uri150,omitempty"`
	ResourceURL string `json:"resource_url,omitempty"`
	Width       int    `json:"width,omitempty"`
	Height      int    `json:"height,omitempty"`
}

type Identifier struct {
	Type        string `json:"type"`
	Value       string `json:"value"`
	Description string `json:"description,omitempty"`
}

type Track struct {
	Position     string         `json:"position"`
	Type         string         `json:"type_,omitempty"`
	Title        string         `json:"title"`
	Duration     string         `json:"duration,omitempty"`
	Artists      []ArtistCredit `json:"artists,omitempty"`
	ExtraArtists []ArtistCredit `json:"extraartists,omitempty"`
}

type Release struct {
	ID          int64          `json:"id"`
	Title       string         `json:"title"`
	Year        int            `json:"year,omitempty"`
	Released    string         `json:"released,omitempty"`
	Country     string         `json:"country,omitempty"`
	Notes       string         `json:"notes,omitempty"`
	URI         string         `json:"uri,omitempty"`
	MasterID    int64          `json:"master_id,omitempty"`
	DataQuality string         `json:"data_quality,omitempty"`
	Artists     []ArtistCredit `json:"artists,omitempty"`
	Labels      []LabelRef     `json:"labels,omitempty"`
	Companies   []LabelRef     `json:"companies,omitempty"`
	Formats     []Format       `json:"formats,omitempty"`
	Genres      []string       `json:"genres,omitempty"`
	Styles      []string       `json:"styles,omitempty"`
	Tracklist   []Track        `json:"tracklist,omitempty"`
	Images      []Image        `json:"images,omitempty"`
	Identifiers []Identifier   `json:"identifiers,omitempty"`
	Community   Community      `json:"community,omitempty"`
}

type Master struct {
	ID          int64          `json:"id"`
	Title       string         `json:"title"`
	Year        int            `json:"year,omitempty"`
	MainRelease int64          `json:"main_release,omitempty"`
	URI         string         `json:"uri,omitempty"`
	Artists     []ArtistCredit `json:"artists,omitempty"`
	Genres      []string       `json:"genres,omitempty"`
	Styles      []string       `json:"styles,omitempty"`
	Tracklist   []Track        `json:"tracklist,omitempty"`
	Images      []Image        `json:"images,omitempty"`
}

type Artist struct {
	ID          int64          `json:"id"`
	Name        string         `json:"name"`
	RealName    string         `json:"realname,omitempty"`
	Profile     string         `json:"profile,omitempty"`
	URI         string         `json:"uri,omitempty"`
	URLs        []string       `json:"urls,omitempty"`
	NameVars    []string       `json:"namevariations,omitempty"`
	Aliases     []ArtistCredit `json:"aliases,omitempty"`
	Members     []ArtistCredit `json:"members,omitempty"`
	Groups      []ArtistCredit `json:"groups,omitempty"`
	Images      []Image        `json:"images,omitempty"`
	DataQuality string         `json:"data_quality,omitempty"`
}

type Label struct {
	Name        string   `json:"name"`
	ID          int64    `json:"id"`
	Profile     string   `json:"profile,omitempty"`
	ContactInfo string   `json:"contact_info,omitempty"`
	URI         string   `json:"uri,omitempty"`
	URLs        []string `json:"urls,omitempty"`
	Images      []Image  `json:"images,omitempty"`
	ParentLabel *struct {
		ID   int64  `json:"id"`
		Name string `json:"name"`
	} `json:"parent_label,omitempty"`
	SubLabels []LabelRef `json:"sublabels,omitempty"`
}

// APIError is the body Discogs returns alongside a non-2xx status.
type APIError struct {
	Message string `json:"message"`
}

// SearchParams are the inputs accepted by the enrichment endpoints.
type SearchParams struct {
	Title  string `json:"title"`
	Artist string `json:"artist"`
	Album  string `json:"album,omitempty"`
}

// Match is a ranked candidate release returned alongside the enriched track.
type Match struct {
	ID            int64    `json:"id"`
	MasterID      int64    `json:"masterId,omitempty"`
	Type          string   `json:"type,omitempty"`
	Artist        string   `json:"artist"`
	Album         string   `json:"album"`
	AlbumArt      string   `json:"albumArt,omitempty"`
	Year          int      `json:"year,omitempty"`
	Country       string   `json:"country,omitempty"`
	Label         string   `json:"label,omitempty"`
	CatalogNumber string   `json:"catalogNumber,omitempty"`
	Barcode       string   `json:"barcode,omitempty"`
	Formats       []string `json:"formats,omitempty"`
	Genres        []string `json:"genres,omitempty"`
	Styles        []string `json:"styles,omitempty"`
	URL           string   `json:"url,omitempty"`
	Score         float64  `json:"score"`
}

// EnrichedTrack is the normalized metadata returned to callers. Durations are
// in milliseconds.
type EnrichedTrack struct {
	Title            string   `json:"title"`
	Artist           string   `json:"artist"`
	AlbumArtist      string   `json:"albumArtist,omitempty"`
	Album            string   `json:"album"`
	AlbumArt         string   `json:"albumArt,omitempty"`
	DurationMs       int64    `json:"durationMs,omitempty"`
	TrackNumber      int      `json:"trackNumber,omitempty"`
	DiscNumber       int      `json:"discNumber,omitempty"`
	TrackPosition    string   `json:"trackPosition,omitempty"`
	ReleaseDate      string   `json:"releaseDate,omitempty"`
	Year             int      `json:"year,omitempty"`
	OriginalYear     int      `json:"originalYear,omitempty"`
	Label            string   `json:"label,omitempty"`
	CatalogNumber    string   `json:"catalogNumber,omitempty"`
	Country          string   `json:"country,omitempty"`
	Barcode          string   `json:"barcode,omitempty"`
	Formats          []string `json:"formats,omitempty"`
	Genres           []string `json:"genres,omitempty"`
	Styles           []string `json:"styles,omitempty"`
	DiscogsURL       string   `json:"discogsUrl,omitempty"`
	DiscogsReleaseID int64    `json:"discogsReleaseId,omitempty"`
	DiscogsMasterID  int64    `json:"discogsMasterId,omitempty"`
	DiscogsArtistID  int64    `json:"discogsArtistId,omitempty"`
}

// EnrichResponse is the payload returned by /enrich and /search.
type EnrichResponse struct {
	Track   *EnrichedTrack `json:"track"`
	Matches []Match        `json:"matches"`
}

// RateLimitSnapshot is the last quota state Discogs reported, from the
// X-Discogs-Ratelimit-* response headers.
type RateLimitSnapshot struct {
	Limit      int       `json:"limit"`
	Used       int       `json:"used"`
	Remaining  int       `json:"remaining"`
	ObservedAt time.Time `json:"observedAt,omitzero"`
}
