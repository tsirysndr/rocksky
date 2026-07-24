package rocksky

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/bluesky-social/indigo/xrpc"
)

// Library is the authenticated client for app.rocksky.library.* — the Subsonic /
// navidrome-compatible surface over a user's uploaded music. Every method
// requires auth, so a Library can only be obtained from [Client.Library], which
// errors unless a token was attached via [Client.WithToken].
//
// Outputs are the AppView's raw JSON payloads (the library lexicons are
// intentionally loose), returned as json.RawMessage. Methods that take optional
// parameters accept them as an opts map keyed by the camelCase field name (pass
// nil for none).
type Library struct {
	xrpc *xrpc.Client
}

// Library returns the authenticated app.rocksky.library.* client. It errors
// unless an access token was attached via [Client.WithToken].
func (c *Client) Library() (*Library, error) {
	if c.xrpc.Auth == nil || c.xrpc.Auth.AccessJwt == "" {
		return nil, errors.New("app.rocksky.library.* requires an access token; call WithToken first")
	}
	return &Library{xrpc: c.xrpc}, nil
}

func (l *Library) query(ctx context.Context, nsid string, params map[string]any) (json.RawMessage, error) {
	filtered := make(map[string]any, len(params))
	for k, v := range params {
		if s, ok := v.(string); ok && s == "" {
			continue
		}
		filtered[k] = v
	}
	var out json.RawMessage
	if err := l.xrpc.Do(ctx, xrpc.Query, "", nsid, filtered, nil, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func (l *Library) procedure(ctx context.Context, nsid string, body map[string]any) (json.RawMessage, error) {
	var out json.RawMessage
	if err := l.xrpc.Do(ctx, xrpc.Procedure, "application/json", nsid, nil, body, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// Ping calls app.rocksky.library.ping (requires auth).
func (l *Library) Ping(ctx context.Context) (json.RawMessage, error) {
	return l.query(ctx, "app.rocksky.library.ping", nil)
}

// GetLicense calls app.rocksky.library.getLicense (requires auth).
func (l *Library) GetLicense(ctx context.Context) (json.RawMessage, error) {
	return l.query(ctx, "app.rocksky.library.getLicense", nil)
}

// GetMusicFolders calls app.rocksky.library.getMusicFolders (requires auth).
func (l *Library) GetMusicFolders(ctx context.Context) (json.RawMessage, error) {
	return l.query(ctx, "app.rocksky.library.getMusicFolders", nil)
}

// GetScanStatus calls app.rocksky.library.getScanStatus (requires auth).
func (l *Library) GetScanStatus(ctx context.Context) (json.RawMessage, error) {
	return l.query(ctx, "app.rocksky.library.getScanStatus", nil)
}

// StartScan calls app.rocksky.library.startScan (requires auth).
func (l *Library) StartScan(ctx context.Context) (json.RawMessage, error) {
	return l.query(ctx, "app.rocksky.library.startScan", nil)
}

// GetUser calls app.rocksky.library.getUser (requires auth).
func (l *Library) GetUser(ctx context.Context) (json.RawMessage, error) {
	return l.query(ctx, "app.rocksky.library.getUser", nil)
}

// GetArtists calls app.rocksky.library.getArtists (requires auth).
func (l *Library) GetArtists(ctx context.Context) (json.RawMessage, error) {
	return l.query(ctx, "app.rocksky.library.getArtists", nil)
}

// GetIndexes calls app.rocksky.library.getIndexes (requires auth).
func (l *Library) GetIndexes(ctx context.Context) (json.RawMessage, error) {
	return l.query(ctx, "app.rocksky.library.getIndexes", nil)
}

// GetArtist calls app.rocksky.library.getArtist (requires auth).
func (l *Library) GetArtist(ctx context.Context, id string) (json.RawMessage, error) {
	params := map[string]any{}
	params["id"] = id
	return l.query(ctx, "app.rocksky.library.getArtist", params)
}

// GetArtistInfo calls app.rocksky.library.getArtistInfo (requires auth).
func (l *Library) GetArtistInfo(ctx context.Context, id string) (json.RawMessage, error) {
	params := map[string]any{}
	params["id"] = id
	return l.query(ctx, "app.rocksky.library.getArtistInfo", params)
}

// GetAlbum calls app.rocksky.library.getAlbum (requires auth).
func (l *Library) GetAlbum(ctx context.Context, id string) (json.RawMessage, error) {
	params := map[string]any{}
	params["id"] = id
	return l.query(ctx, "app.rocksky.library.getAlbum", params)
}

// GetAlbumList calls app.rocksky.library.getAlbumList (requires auth).
func (l *Library) GetAlbumList(ctx context.Context, typ string, opts map[string]any) (json.RawMessage, error) {
	params := map[string]any{}
	params["type"] = typ
	for k, v := range opts {
		params[k] = v
	}
	return l.query(ctx, "app.rocksky.library.getAlbumList", params)
}

// GetAlbumInfo calls app.rocksky.library.getAlbumInfo (requires auth).
func (l *Library) GetAlbumInfo(ctx context.Context, id string) (json.RawMessage, error) {
	params := map[string]any{}
	params["id"] = id
	return l.query(ctx, "app.rocksky.library.getAlbumInfo", params)
}

// GetSong calls app.rocksky.library.getSong (requires auth).
func (l *Library) GetSong(ctx context.Context, id string) (json.RawMessage, error) {
	params := map[string]any{}
	params["id"] = id
	return l.query(ctx, "app.rocksky.library.getSong", params)
}

// GetRandomSongs calls app.rocksky.library.getRandomSongs (requires auth).
func (l *Library) GetRandomSongs(ctx context.Context, opts map[string]any) (json.RawMessage, error) {
	params := map[string]any{}
	for k, v := range opts {
		params[k] = v
	}
	return l.query(ctx, "app.rocksky.library.getRandomSongs", params)
}

// GetSongsByGenre calls app.rocksky.library.getSongsByGenre (requires auth).
func (l *Library) GetSongsByGenre(ctx context.Context, genre string, opts map[string]any) (json.RawMessage, error) {
	params := map[string]any{}
	params["genre"] = genre
	for k, v := range opts {
		params[k] = v
	}
	return l.query(ctx, "app.rocksky.library.getSongsByGenre", params)
}

// GetSimilarSongs calls app.rocksky.library.getSimilarSongs (requires auth).
func (l *Library) GetSimilarSongs(ctx context.Context, id string, opts map[string]any) (json.RawMessage, error) {
	params := map[string]any{}
	params["id"] = id
	for k, v := range opts {
		params[k] = v
	}
	return l.query(ctx, "app.rocksky.library.getSimilarSongs", params)
}

// GetTopSongs calls app.rocksky.library.getTopSongs (requires auth).
func (l *Library) GetTopSongs(ctx context.Context, artist string, opts map[string]any) (json.RawMessage, error) {
	params := map[string]any{}
	params["artist"] = artist
	for k, v := range opts {
		params[k] = v
	}
	return l.query(ctx, "app.rocksky.library.getTopSongs", params)
}

// GetLyrics calls app.rocksky.library.getLyrics (requires auth).
func (l *Library) GetLyrics(ctx context.Context, opts map[string]any) (json.RawMessage, error) {
	params := map[string]any{}
	for k, v := range opts {
		params[k] = v
	}
	return l.query(ctx, "app.rocksky.library.getLyrics", params)
}

// GetMusicDirectory calls app.rocksky.library.getMusicDirectory (requires auth).
func (l *Library) GetMusicDirectory(ctx context.Context, id string) (json.RawMessage, error) {
	params := map[string]any{}
	params["id"] = id
	return l.query(ctx, "app.rocksky.library.getMusicDirectory", params)
}

// GetGenres calls app.rocksky.library.getGenres (requires auth).
func (l *Library) GetGenres(ctx context.Context) (json.RawMessage, error) {
	return l.query(ctx, "app.rocksky.library.getGenres", nil)
}

// Search calls app.rocksky.library.search (requires auth).
func (l *Library) Search(ctx context.Context, query string, opts map[string]any) (json.RawMessage, error) {
	params := map[string]any{}
	params["query"] = query
	for k, v := range opts {
		params[k] = v
	}
	return l.query(ctx, "app.rocksky.library.search", params)
}

// GetStarred calls app.rocksky.library.getStarred (requires auth).
func (l *Library) GetStarred(ctx context.Context) (json.RawMessage, error) {
	return l.query(ctx, "app.rocksky.library.getStarred", nil)
}

// Star calls app.rocksky.library.star (requires auth).
func (l *Library) Star(ctx context.Context, id string, opts map[string]any) (json.RawMessage, error) {
	params := map[string]any{}
	params["id"] = id
	for k, v := range opts {
		params[k] = v
	}
	return l.procedure(ctx, "app.rocksky.library.star", params)
}

// Unstar calls app.rocksky.library.unstar (requires auth).
func (l *Library) Unstar(ctx context.Context, id string, opts map[string]any) (json.RawMessage, error) {
	params := map[string]any{}
	params["id"] = id
	for k, v := range opts {
		params[k] = v
	}
	return l.procedure(ctx, "app.rocksky.library.unstar", params)
}

// GetPlaylists calls app.rocksky.library.getPlaylists (requires auth).
func (l *Library) GetPlaylists(ctx context.Context) (json.RawMessage, error) {
	return l.query(ctx, "app.rocksky.library.getPlaylists", nil)
}

// GetPlaylist calls app.rocksky.library.getPlaylist (requires auth).
func (l *Library) GetPlaylist(ctx context.Context, id string) (json.RawMessage, error) {
	params := map[string]any{}
	params["id"] = id
	return l.query(ctx, "app.rocksky.library.getPlaylist", params)
}

// CreatePlaylist calls app.rocksky.library.createPlaylist (requires auth).
func (l *Library) CreatePlaylist(ctx context.Context, name string) (json.RawMessage, error) {
	params := map[string]any{}
	params["name"] = name
	return l.procedure(ctx, "app.rocksky.library.createPlaylist", params)
}

// UpdatePlaylist calls app.rocksky.library.updatePlaylist (requires auth).
func (l *Library) UpdatePlaylist(ctx context.Context, playlistId string, opts map[string]any) (json.RawMessage, error) {
	params := map[string]any{}
	params["playlistId"] = playlistId
	for k, v := range opts {
		params[k] = v
	}
	return l.procedure(ctx, "app.rocksky.library.updatePlaylist", params)
}

// DeletePlaylist calls app.rocksky.library.deletePlaylist (requires auth).
func (l *Library) DeletePlaylist(ctx context.Context, id string) (json.RawMessage, error) {
	params := map[string]any{}
	params["id"] = id
	return l.procedure(ctx, "app.rocksky.library.deletePlaylist", params)
}

// DeleteSong calls app.rocksky.library.deleteSong (requires auth).
func (l *Library) DeleteSong(ctx context.Context, id string) (json.RawMessage, error) {
	params := map[string]any{}
	params["id"] = id
	return l.procedure(ctx, "app.rocksky.library.deleteSong", params)
}

// DeleteAlbum calls app.rocksky.library.deleteAlbum (requires auth).
func (l *Library) DeleteAlbum(ctx context.Context, id string) (json.RawMessage, error) {
	params := map[string]any{}
	params["id"] = id
	return l.procedure(ctx, "app.rocksky.library.deleteAlbum", params)
}

// Scrobble calls app.rocksky.library.scrobble (requires auth).
func (l *Library) Scrobble(ctx context.Context, id string, opts map[string]any) (json.RawMessage, error) {
	params := map[string]any{}
	params["id"] = id
	for k, v := range opts {
		params[k] = v
	}
	return l.procedure(ctx, "app.rocksky.library.scrobble", params)
}

// UpdateNowPlaying calls app.rocksky.library.updateNowPlaying (requires auth).
func (l *Library) UpdateNowPlaying(ctx context.Context, id string) (json.RawMessage, error) {
	params := map[string]any{}
	params["id"] = id
	return l.procedure(ctx, "app.rocksky.library.updateNowPlaying", params)
}

// GetNowPlaying calls app.rocksky.library.getNowPlaying (requires auth).
func (l *Library) GetNowPlaying(ctx context.Context) (json.RawMessage, error) {
	return l.query(ctx, "app.rocksky.library.getNowPlaying", nil)
}

// GetPlayQueue calls app.rocksky.library.getPlayQueue (requires auth).
func (l *Library) GetPlayQueue(ctx context.Context) (json.RawMessage, error) {
	return l.query(ctx, "app.rocksky.library.getPlayQueue", nil)
}

// SavePlayQueue calls app.rocksky.library.savePlayQueue (requires auth).
func (l *Library) SavePlayQueue(ctx context.Context, opts map[string]any) (json.RawMessage, error) {
	params := map[string]any{}
	for k, v := range opts {
		params[k] = v
	}
	return l.procedure(ctx, "app.rocksky.library.savePlayQueue", params)
}

// GetStreamUrl calls app.rocksky.library.getStreamUrl (requires auth).
func (l *Library) GetStreamUrl(ctx context.Context, id string, opts map[string]any) (json.RawMessage, error) {
	params := map[string]any{}
	params["id"] = id
	for k, v := range opts {
		params[k] = v
	}
	return l.query(ctx, "app.rocksky.library.getStreamUrl", params)
}

// GetDownloadUrl calls app.rocksky.library.getDownloadUrl (requires auth).
func (l *Library) GetDownloadUrl(ctx context.Context, id string) (json.RawMessage, error) {
	params := map[string]any{}
	params["id"] = id
	return l.query(ctx, "app.rocksky.library.getDownloadUrl", params)
}

// GetCoverArtUrl calls app.rocksky.library.getCoverArtUrl (requires auth).
func (l *Library) GetCoverArtUrl(ctx context.Context, id string, opts map[string]any) (json.RawMessage, error) {
	params := map[string]any{}
	params["id"] = id
	for k, v := range opts {
		params[k] = v
	}
	return l.query(ctx, "app.rocksky.library.getCoverArtUrl", params)
}

// GetInternetRadioStations calls app.rocksky.library.getInternetRadioStations (requires auth).
func (l *Library) GetInternetRadioStations(ctx context.Context) (json.RawMessage, error) {
	return l.query(ctx, "app.rocksky.library.getInternetRadioStations", nil)
}
