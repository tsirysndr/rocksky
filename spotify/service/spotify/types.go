package spotify

// ProxyResult is what a proxied call produces, either from cache or straight
// from the Spotify Web API. The body is Spotify's raw JSON, untouched, so
// existing clients keep deserializing exactly what they do today.
type ProxyResult struct {
	Status      int
	ContentType string
	Body        []byte
	// RetryAfter is set (in seconds) when Spotify or the local cooldown asks
	// callers to back off.
	RetryAfter string
	Cached     bool
	Stale      bool
	// Source names who answered: riff (our local Parquet catalog) or spotify.
	// Surfaced as the X-Source response header so a caller can tell whether a
	// request cost a Spotify rate-limit slot.
	Source string
}

// Response sources, reported in the X-Source header.
const (
	SourceRiff    = "riff"
	SourceSpotify = "spotify"
)

// ProxyError is a locally-produced error carrying the HTTP status the caller
// should receive (bad request, missing auth, ...).
type ProxyError struct {
	Status  int
	Message string
}

func (e *ProxyError) Error() string { return e.Message }

// tokenResponse is the client-credentials grant response from
// accounts.spotify.com.
type tokenResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	ExpiresIn   int    `json:"expires_in"`
}
