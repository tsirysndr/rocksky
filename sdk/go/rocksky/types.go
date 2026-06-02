package rocksky

import "github.com/tsirysndr/rocksky/sdk/go/rocksky/gen"

// View types are sourced from `apps/api/lexicons/**/*.json` via codegen
// in `sdk/go/rocksky/gen`. This file re-exports them under the historical
// SDK names and extends a few with fields the lexicon does not yet declare.

type ProfileViewBasic = gen.ActorProfileViewBasic

type ProfileViewDetailed struct {
	gen.ActorProfileViewDetailed
	SpotifyConnected bool `json:"spotifyConnected,omitempty"`
}

type ArtistViewBasic = gen.ArtistViewBasic
type ArtistViewDetailed = gen.ArtistViewDetailed

type AlbumViewBasic = gen.AlbumViewBasic
type AlbumViewDetailed = gen.AlbumViewDetailed

type SongViewBasic = gen.SongViewBasic
type SongViewDetailed = gen.SongViewDetailed

type FirstScrobbleView = gen.SongFirstScrobbleView

type ScrobbleViewBasic = gen.ScrobbleViewBasic
type ScrobbleViewDetailed = gen.ScrobbleViewDetailed

type RecentListenerView = gen.SongRecentListenerView
type ListenerViewBasic = gen.ArtistListenerViewBasic

type ChartPoint = gen.ChartsScrobbleViewBasic

type StatsView = gen.StatsView

type WrappedView = gen.StatsWrappedView
type WrappedArtist = gen.StatsWrappedArtist
type WrappedTrack = gen.StatsWrappedTrack
type WrappedAlbum = gen.StatsWrappedAlbum
type WrappedGenre = gen.StatsWrappedGenreCount
type WrappedMonth = gen.StatsWrappedMonthCount
type WrappedDay = gen.StatsWrappedDayCount
type WrappedMilestone = gen.StatsWrappedMilestone

type SearchResultsView = gen.FeedSearchResultsView
type StoryView = gen.FeedStoryView
type RecommendationView = gen.FeedRecommendationView
type RecommendedArtistView = gen.FeedRecommendedArtistView
type RecommendedAlbumView = gen.FeedRecommendedAlbumView
type FeedItemView = gen.FeedItemView

type ShoutAuthor = gen.ShoutAuthor
type ShoutView = gen.ShoutView
