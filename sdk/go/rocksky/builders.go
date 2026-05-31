package rocksky

import "context"

// Fluent builders for the handful of endpoints where chaining is meaningfully
// nicer than a struct literal: write ops with many optional fields, and the
// scrobble chart query with seven filters. Every other endpoint sticks to the
// idiomatic struct-param style.

// ScrobbleBuilder builds a CreateScrobble request.
//
//	out, err := client.Scrobble.NewScrobble("Black Hole Sun", "Soundgarden").
//	    Album("Superunknown").
//	    Duration(320_000).
//	    ISRC("USXXX1234567").
//	    Send(ctx)
type ScrobbleBuilder struct {
	s  *ScrobbleService
	in CreateScrobbleInput
}

// NewScrobble starts a builder. Title and artist are required.
func (s *ScrobbleService) NewScrobble(title, artist string) *ScrobbleBuilder {
	return &ScrobbleBuilder{s: s, in: CreateScrobbleInput{Title: title, Artist: artist}}
}

func (b *ScrobbleBuilder) Album(v string) *ScrobbleBuilder            { b.in.Album = v; return b }
func (b *ScrobbleBuilder) Duration(ms int) *ScrobbleBuilder           { b.in.Duration = ms; return b }
func (b *ScrobbleBuilder) MBID(v string) *ScrobbleBuilder             { b.in.MBID = v; return b }
func (b *ScrobbleBuilder) ISRC(v string) *ScrobbleBuilder             { b.in.ISRC = v; return b }
func (b *ScrobbleBuilder) AlbumArt(v string) *ScrobbleBuilder         { b.in.AlbumArt = v; return b }
func (b *ScrobbleBuilder) TrackNumber(v int) *ScrobbleBuilder         { b.in.TrackNumber = v; return b }
func (b *ScrobbleBuilder) ReleaseDate(v string) *ScrobbleBuilder      { b.in.ReleaseDate = v; return b }
func (b *ScrobbleBuilder) Year(v int) *ScrobbleBuilder                { b.in.Year = v; return b }
func (b *ScrobbleBuilder) DiscNumber(v int) *ScrobbleBuilder          { b.in.DiscNumber = v; return b }
func (b *ScrobbleBuilder) Lyrics(v string) *ScrobbleBuilder           { b.in.Lyrics = v; return b }
func (b *ScrobbleBuilder) Composer(v string) *ScrobbleBuilder         { b.in.Composer = v; return b }
func (b *ScrobbleBuilder) Copyright(v string) *ScrobbleBuilder        { b.in.CopyrightMessage = v; return b }
func (b *ScrobbleBuilder) Label(v string) *ScrobbleBuilder            { b.in.Label = v; return b }
func (b *ScrobbleBuilder) ArtistPicture(v string) *ScrobbleBuilder    { b.in.ArtistPicture = v; return b }
func (b *ScrobbleBuilder) SpotifyLink(v string) *ScrobbleBuilder      { b.in.SpotifyLink = v; return b }
func (b *ScrobbleBuilder) LastfmLink(v string) *ScrobbleBuilder       { b.in.LastfmLink = v; return b }
func (b *ScrobbleBuilder) TidalLink(v string) *ScrobbleBuilder        { b.in.TidalLink = v; return b }
func (b *ScrobbleBuilder) AppleMusicLink(v string) *ScrobbleBuilder   { b.in.AppleMusicLink = v; return b }
func (b *ScrobbleBuilder) YoutubeLink(v string) *ScrobbleBuilder      { b.in.YoutubeLink = v; return b }
func (b *ScrobbleBuilder) DeezerLink(v string) *ScrobbleBuilder       { b.in.DeezerLink = v; return b }
func (b *ScrobbleBuilder) Timestamp(unixSec int64) *ScrobbleBuilder   { b.in.Timestamp = unixSec; return b }

// Input returns the request body that Send would post. Useful for logging or
// composing additional metadata before submission.
func (b *ScrobbleBuilder) Input() CreateScrobbleInput { return b.in }

// Send executes the request and returns the created scrobble.
func (b *ScrobbleBuilder) Send(ctx context.Context) (*ScrobbleViewBasic, error) {
	return b.s.CreateScrobble(ctx, b.in)
}

// ShoutBuilder builds a CreateShout request.
//
//	out, err := client.Shout.NewShout("listening to this on repeat").Send(ctx)
type ShoutBuilder struct {
	s  *ShoutService
	in CreateShoutInput
}

func (s *ShoutService) NewShout(message string) *ShoutBuilder {
	return &ShoutBuilder{s: s, in: CreateShoutInput{Message: message}}
}

func (b *ShoutBuilder) Message(v string) *ShoutBuilder { b.in.Message = v; return b }

func (b *ShoutBuilder) Send(ctx context.Context) (*ShoutView, error) {
	return b.s.CreateShout(ctx, b.in)
}

// ReplyBuilder builds a ReplyShout request.
//
//	out, err := client.Shout.NewReply("at://.../shout/123", "agreed!").Send(ctx)
type ReplyBuilder struct {
	s  *ShoutService
	in ReplyShoutInput
}

func (s *ShoutService) NewReply(parentURI, message string) *ReplyBuilder {
	return &ReplyBuilder{s: s, in: ReplyShoutInput{Parent: parentURI, Message: message}}
}

func (b *ReplyBuilder) Message(v string) *ReplyBuilder { b.in.Message = v; return b }
func (b *ReplyBuilder) Parent(v string) *ReplyBuilder  { b.in.Parent = v; return b }

func (b *ReplyBuilder) Send(ctx context.Context) (*ShoutView, error) {
	return b.s.ReplyShout(ctx, b.in)
}

// ScrobblesChartBuilder builds a GetScrobblesChart query.
//
//	chart, err := client.Charts.NewScrobblesChart().
//	    Actor("tsiry.bsky.social").
//	    From("2025-01-01").
//	    To("2025-12-31").
//	    Do(ctx)
type ScrobblesChartBuilder struct {
	s *ChartsService
	p GetScrobblesChartParams
}

func (s *ChartsService) NewScrobblesChart() *ScrobblesChartBuilder {
	return &ScrobblesChartBuilder{s: s}
}

func (b *ScrobblesChartBuilder) Actor(v string) *ScrobblesChartBuilder     { b.p.Actor = v; return b }
func (b *ScrobblesChartBuilder) ArtistURI(v string) *ScrobblesChartBuilder { b.p.ArtistURI = v; return b }
func (b *ScrobblesChartBuilder) AlbumURI(v string) *ScrobblesChartBuilder  { b.p.AlbumURI = v; return b }
func (b *ScrobblesChartBuilder) SongURI(v string) *ScrobblesChartBuilder   { b.p.SongURI = v; return b }
func (b *ScrobblesChartBuilder) Genre(v string) *ScrobblesChartBuilder     { b.p.Genre = v; return b }
func (b *ScrobblesChartBuilder) From(v string) *ScrobblesChartBuilder      { b.p.From = v; return b }
func (b *ScrobblesChartBuilder) To(v string) *ScrobblesChartBuilder        { b.p.To = v; return b }

func (b *ScrobblesChartBuilder) Do(ctx context.Context) (*GetScrobblesChartResponse, error) {
	return b.s.GetScrobblesChart(ctx, b.p)
}
