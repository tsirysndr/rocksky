package rocksky

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/bluesky-social/indigo/api/atproto"
	"github.com/bluesky-social/indigo/atproto/identity"
	"github.com/bluesky-social/indigo/atproto/syntax"
	"github.com/bluesky-social/indigo/xrpc"
	"github.com/tsirysndr/rocksky/sdk/go/rocksky/gen"
)

// Collection NSIDs written by the agent.
const (
	colScrobble = "app.rocksky.scrobble"
	colSong     = "app.rocksky.song"
	colAlbum    = "app.rocksky.album"
	colArtist   = "app.rocksky.artist"
	colLike     = "app.rocksky.like"
	colFollow   = "app.rocksky.graph.follow"
	colShout    = "app.rocksky.shout"
	colStatus   = "app.rocksky.actor.status"
)

// Agent is an authenticated Rocksky client: it logs in with an app password and
// writes app.rocksky.* records to the user's PDS.
type Agent struct {
	client *xrpc.Client // pointed at the user's PDS, with Auth set
	did    string
	idx    *Index // optional local dedup index
}

// UseIndex attaches a local dedup index. When set, the write verbs skip records
// that already exist (returning the existing URI) and record new ones. Populate
// it with [Agent.SyncRepo] and keep it live with [Agent.HydrateFromJetstream].
func (a *Agent) UseIndex(idx *Index) { a.idx = idx }

// Login resolves the account's PDS, authenticates with an app password, and
// returns an [Agent]. identifier is a handle or DID.
func Login(ctx context.Context, identifier, appPassword string) (*Agent, error) {
	atid, err := syntax.ParseAtIdentifier(identifier)
	if err != nil {
		return nil, fmt.Errorf("parse identifier: %w", err)
	}
	id, err := identity.DefaultDirectory().Lookup(ctx, atid)
	if err != nil {
		return nil, fmt.Errorf("resolve identity: %w", err)
	}
	pds := id.PDSEndpoint()
	if pds == "" {
		return nil, fmt.Errorf("no atproto_pds endpoint for %s", identifier)
	}

	// A generous timeout: SyncRepo downloads the full repo CAR (tens of MB).
	client := &xrpc.Client{Host: pds, Client: &http.Client{Timeout: 10 * time.Minute}}
	sess, err := atproto.ServerCreateSession(ctx, client, &atproto.ServerCreateSession_Input{
		Identifier: id.DID.String(),
		Password:   appPassword,
	})
	if err != nil {
		return nil, fmt.Errorf("createSession: %w", err)
	}
	client.Auth = &xrpc.AuthInfo{
		AccessJwt:  sess.AccessJwt,
		RefreshJwt: sess.RefreshJwt,
		Handle:     sess.Handle,
		Did:        sess.Did,
	}
	return &Agent{client: client, did: sess.Did}, nil
}

// DID returns the authenticated account's DID.
func (a *Agent) DID() string { return a.did }

// RefreshSession rotates the access token using the stored refresh token.
// indigo does not auto-refresh, so call this on an ExpiredToken error.
func (a *Agent) RefreshSession(ctx context.Context) error {
	prev := a.client.Auth.AccessJwt
	a.client.Auth.AccessJwt = a.client.Auth.RefreshJwt // refresh uses the refresh JWT as bearer
	out, err := atproto.ServerRefreshSession(ctx, a.client)
	if err != nil {
		a.client.Auth.AccessJwt = prev
		return fmt.Errorf("refreshSession: %w", err)
	}
	a.client.Auth.AccessJwt = out.AccessJwt
	a.client.Auth.RefreshJwt = out.RefreshJwt
	return nil
}

// withType marshals rec to a generic map and stamps the record's $type — the
// generated records carry no $type field, but createRecord needs one.
func withType(nsid string, rec any) (map[string]any, error) {
	b, err := json.Marshal(rec)
	if err != nil {
		return nil, err
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		return nil, err
	}
	m["$type"] = nsid
	return m, nil
}

// create writes a new record and returns its at:// URI.
func (a *Agent) create(ctx context.Context, collection string, rec any) (string, error) {
	m, err := withType(collection, rec)
	if err != nil {
		return "", err
	}
	input := map[string]any{"repo": a.did, "collection": collection, "record": m}
	var out atproto.RepoCreateRecord_Output
	if err := a.client.Do(ctx, xrpc.Procedure, "application/json",
		"com.atproto.repo.createRecord", nil, input, &out); err != nil {
		return "", fmt.Errorf("create %s: %w", collection, err)
	}
	return out.Uri, nil
}

// put upserts a record at rkey and returns its at:// URI.
func (a *Agent) put(ctx context.Context, collection, rkey string, rec any) (string, error) {
	m, err := withType(collection, rec)
	if err != nil {
		return "", err
	}
	input := map[string]any{"repo": a.did, "collection": collection, "rkey": rkey, "record": m}
	var out atproto.RepoPutRecord_Output
	if err := a.client.Do(ctx, xrpc.Procedure, "application/json",
		"com.atproto.repo.putRecord", nil, input, &out); err != nil {
		return "", fmt.Errorf("put %s/%s: %w", collection, rkey, err)
	}
	return out.Uri, nil
}

// Delete removes a record by collection + rkey.
func (a *Agent) Delete(ctx context.Context, collection, rkey string) error {
	input := map[string]any{"repo": a.did, "collection": collection, "rkey": rkey}
	if err := a.client.Do(ctx, xrpc.Procedure, "application/json",
		"com.atproto.repo.deleteRecord", nil, input, nil); err != nil {
		return fmt.Errorf("delete %s/%s: %w", collection, rkey, err)
	}
	return nil
}

func nowRFC3339() string { return time.Now().UTC().Format("2006-01-02T15:04:05.000Z") }

// Scrobble writes a play (app.rocksky.scrobble) and returns its URI. createdAt
// defaults to now. The AppView derives the song/album/artist catalog from the
// scrobble; use [Agent.CreateSong]/[Agent.CreateAlbum]/[Agent.CreateArtist] to
// write those records explicitly.
func (a *Agent) Scrobble(ctx context.Context, rec gen.ScrobbleRecord) (string, error) {
	if rec.CreatedAt == "" {
		rec.CreatedAt = nowRFC3339()
	}
	if a.idx != nil {
		secs, _ := rfc3339Secs(rec.CreatedAt)
		if uri, _ := a.idx.ScrobbleURI(a.did, rec.Title, rec.Artist, rec.Album, secs); uri != "" {
			return uri, nil
		}
	}
	uri, err := a.create(ctx, colScrobble, rec)
	if err == nil && a.idx != nil {
		secs, _ := rfc3339Secs(rec.CreatedAt)
		_ = a.idx.recordScrobble(a.did, rec.Title, rec.Artist, rec.Album, secs, uri)
	}
	return uri, err
}

// CreateSong writes a canonical track record (app.rocksky.song). Returns the URI.
func (a *Agent) CreateSong(ctx context.Context, rec gen.SongRecord) (string, error) {
	if rec.CreatedAt == "" {
		rec.CreatedAt = nowRFC3339()
	}
	if a.idx != nil {
		if uri, _ := a.idx.SongURI(a.did, rec.Title, rec.Artist, rec.Album); uri != "" {
			return uri, nil
		}
	}
	uri, err := a.create(ctx, colSong, rec)
	if err == nil && a.idx != nil {
		_ = a.idx.recordSong(a.did, rec.Title, rec.Artist, rec.Album, uri)
	}
	return uri, err
}

// CreateAlbum writes an album record (app.rocksky.album). Returns the URI. With
// a dedup index, returns the existing URI when the album already exists.
func (a *Agent) CreateAlbum(ctx context.Context, rec gen.AlbumRecord) (string, error) {
	if rec.CreatedAt == "" {
		rec.CreatedAt = nowRFC3339()
	}
	if a.idx != nil {
		if uri, _ := a.idx.AlbumURI(a.did, rec.Title, rec.Artist); uri != "" {
			return uri, nil
		}
	}
	uri, err := a.create(ctx, colAlbum, rec)
	if err == nil && a.idx != nil {
		_ = a.idx.recordAlbum(a.did, rec.Title, rec.Artist, uri)
	}
	return uri, err
}

// CreateArtist writes an artist record (app.rocksky.artist). Returns the URI.
// With a dedup index, returns the existing URI when the artist already exists.
func (a *Agent) CreateArtist(ctx context.Context, rec gen.ArtistRecord) (string, error) {
	if rec.CreatedAt == "" {
		rec.CreatedAt = nowRFC3339()
	}
	if a.idx != nil {
		if uri, _ := a.idx.ArtistURI(a.did, rec.Name); uri != "" {
			return uri, nil
		}
	}
	uri, err := a.create(ctx, colArtist, rec)
	if err == nil && a.idx != nil {
		_ = a.idx.recordArtist(a.did, rec.Name, uri)
	}
	return uri, err
}

// Like likes a record by strong reference (uri + cid). Returns the like URI.
func (a *Agent) Like(ctx context.Context, uri, cid string) (string, error) {
	return a.create(ctx, colLike, gen.LikeRecord{
		Subject:   &gen.StrongRef{URI: uri, CID: cid},
		CreatedAt: nowRFC3339(),
	})
}

// Follow follows an account by DID (app.rocksky.graph.follow). Returns the URI.
func (a *Agent) Follow(ctx context.Context, did string) (string, error) {
	return a.create(ctx, colFollow, gen.FollowRecord{
		Subject:   did,
		CreatedAt: nowRFC3339(),
	})
}

// Shout posts a shout on a subject (app.rocksky.shout). Returns the URI.
func (a *Agent) Shout(ctx context.Context, subjectURI, subjectCID, message string) (string, error) {
	return a.create(ctx, colShout, gen.ShoutRecord{
		Subject:   &gen.StrongRef{URI: subjectURI, CID: subjectCID},
		Message:   message,
		CreatedAt: nowRFC3339(),
	})
}

// ReplyShout replies to another shout, with a parent strong-ref.
func (a *Agent) ReplyShout(ctx context.Context, subjectURI, subjectCID, parentURI, parentCID, message string) (string, error) {
	return a.create(ctx, colShout, gen.ShoutRecord{
		Subject:   &gen.StrongRef{URI: subjectURI, CID: subjectCID},
		Parent:    &gen.StrongRef{URI: parentURI, CID: parentCID},
		Message:   message,
		CreatedAt: nowRFC3339(),
	})
}

// SetNowPlaying upserts the actor's now-playing status singleton (rkey "self").
func (a *Agent) SetNowPlaying(ctx context.Context, track gen.ActorTrackView) (string, error) {
	return a.put(ctx, colStatus, "self", gen.StatusRecord{
		Track:     &track,
		StartedAt: nowRFC3339(),
	})
}

// ClearNowPlaying deletes the actor's now-playing status singleton.
func (a *Agent) ClearNowPlaying(ctx context.Context) error {
	return a.Delete(ctx, colStatus, "self")
}
