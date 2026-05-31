package rocksky

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

// DefaultBaseURL is the public production Rocksky API endpoint.
const DefaultBaseURL = "https://api.rocksky.app"

// DefaultUserAgent is sent on every outgoing request unless overridden.
const DefaultUserAgent = "rocksky-go/0.1"

// Client is the entry point for interacting with the Rocksky API. Construct one
// with NewClient and reach endpoints through the namespaced services
// (Actor, Album, Artist, Song, Scrobble, Charts, Stats, Feed, Graph, Like, Shout).
//
// A Client is safe for concurrent use by multiple goroutines.
type Client struct {
	baseURL     *url.URL
	httpClient  *http.Client
	bearerToken string
	userAgent   string
	headers     http.Header

	Actor    *ActorService
	Album    *AlbumService
	Artist   *ArtistService
	Song     *SongService
	Scrobble *ScrobbleService
	Charts   *ChartsService
	Stats    *StatsService
	Feed     *FeedService
	Graph    *GraphService
	Like     *LikeService
	Shout    *ShoutService
}

// Option configures a Client.
type Option func(*Client)

// WithBaseURL overrides the API base URL. Useful for self-hosted instances or
// pointing tests at httptest.NewServer.
func WithBaseURL(baseURL string) Option {
	return func(c *Client) {
		u, err := url.Parse(baseURL)
		if err == nil {
			c.baseURL = u
		}
	}
}

// WithBearerToken sets the bearer token used for authenticated requests.
// Endpoints that mutate state (Scrobble.CreateScrobble, Like.LikeSong,
// Graph.Follow, ...) will reject calls made without one.
func WithBearerToken(token string) Option {
	return func(c *Client) {
		c.bearerToken = token
	}
}

// WithHTTPClient lets callers inject a custom *http.Client — for example one
// with a tuned Timeout or a transport that adds tracing.
func WithHTTPClient(httpClient *http.Client) Option {
	return func(c *Client) {
		if httpClient != nil {
			c.httpClient = httpClient
		}
	}
}

// WithUserAgent overrides the default User-Agent header.
func WithUserAgent(ua string) Option {
	return func(c *Client) {
		if ua != "" {
			c.userAgent = ua
		}
	}
}

// WithHeader adds (or replaces) a custom header sent on every request.
func WithHeader(key, value string) Option {
	return func(c *Client) {
		c.headers.Set(key, value)
	}
}

// NewClient constructs a Rocksky API client.
func NewClient(opts ...Option) *Client {
	base, _ := url.Parse(DefaultBaseURL)
	c := &Client{
		baseURL:    base,
		httpClient: &http.Client{Timeout: 30 * time.Second},
		userAgent:  DefaultUserAgent,
		headers:    http.Header{},
	}
	for _, opt := range opts {
		opt(c)
	}
	c.Actor = &ActorService{c: c}
	c.Album = &AlbumService{c: c}
	c.Artist = &ArtistService{c: c}
	c.Song = &SongService{c: c}
	c.Scrobble = &ScrobbleService{c: c}
	c.Charts = &ChartsService{c: c}
	c.Stats = &StatsService{c: c}
	c.Feed = &FeedService{c: c}
	c.Graph = &GraphService{c: c}
	c.Like = &LikeService{c: c}
	c.Shout = &ShoutService{c: c}
	return c
}

// BaseURL returns the configured API base URL.
func (c *Client) BaseURL() string { return c.baseURL.String() }

// HasAuth reports whether the client was given a bearer token.
func (c *Client) HasAuth() bool { return c.bearerToken != "" }

// query performs an XRPC query (GET) against /xrpc/<nsid>.
func (c *Client) query(ctx context.Context, nsid string, params url.Values, out any) error {
	return c.do(ctx, http.MethodGet, nsid, params, nil, out)
}

// procedure performs an XRPC procedure (POST) against /xrpc/<nsid>. The body is
// JSON-encoded; pass nil for procedures whose input is empty.
func (c *Client) procedure(ctx context.Context, nsid string, params url.Values, body, out any) error {
	return c.do(ctx, http.MethodPost, nsid, params, body, out)
}

func (c *Client) do(ctx context.Context, method, nsid string, params url.Values, body, out any) error {
	rel := &url.URL{Path: "/xrpc/" + nsid}
	if len(params) > 0 {
		rel.RawQuery = params.Encode()
	}
	u := c.baseURL.ResolveReference(rel)

	var reader io.Reader
	if body != nil {
		buf, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("rocksky: encode request body: %w", err)
		}
		reader = bytes.NewReader(buf)
	}

	req, err := http.NewRequestWithContext(ctx, method, u.String(), reader)
	if err != nil {
		return fmt.Errorf("rocksky: build request: %w", err)
	}
	for key, values := range c.headers {
		for _, v := range values {
			req.Header.Add(key, v)
		}
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", c.userAgent)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.bearerToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.bearerToken)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("rocksky: %s %s: %w", method, nsid, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return parseError(resp)
	}

	if out == nil {
		// drain to allow keep-alive reuse
		_, _ = io.Copy(io.Discard, resp.Body)
		return nil
	}
	if err := json.NewDecoder(resp.Body).Decode(out); err != nil && err != io.EOF {
		return fmt.Errorf("rocksky: decode %s response: %w", nsid, err)
	}
	return nil
}

// queryValues is a small helper that builds url.Values from a map, skipping
// zero-valued entries so callers can rely on Go's natural zero defaults.
type queryValues struct {
	v url.Values
}

func newQuery() queryValues { return queryValues{v: url.Values{}} }

func (q queryValues) setString(key, val string) {
	if val != "" {
		q.v.Set(key, val)
	}
}

func (q queryValues) setInt(key string, val int) {
	if val != 0 {
		q.v.Set(key, strconv.Itoa(val))
	}
}

func (q queryValues) setBool(key string, val bool) {
	if val {
		q.v.Set(key, "true")
	}
}

func (q queryValues) addStrings(key string, vals []string) {
	for _, val := range vals {
		if val != "" {
			q.v.Add(key, val)
		}
	}
}

// Values returns the built url.Values. Returns nil if no entries were added,
// so callers can pass it straight to do() without building an empty query.
func (q queryValues) Values() url.Values {
	if len(q.v) == 0 {
		return nil
	}
	return q.v
}

