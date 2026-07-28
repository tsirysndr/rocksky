package rocksky

import (
	"context"
	"encoding/json"
	"sync"
	"time"

	"github.com/coder/websocket"
)

// DefaultRemoteWS is the remote-control WebSocket endpoint.
const DefaultRemoteWS = "wss://api.rocksky.app/ws"

// RemoteNowPlaying is the now-playing state a player advertises.
type RemoteNowPlaying struct {
	Title       string
	Artist      string
	Album       string
	AlbumArtist string
	AlbumArt    string
	DurationMs  int64 // total track length
	ElapsedMs   int64 // current position
	IsPlaying   bool
}

// RemoteQueueItem is one queue entry. Provide UploadID (Rocksky uploads) or
// TrackID (Navidrome/Subsonic id) so the item can be streamed.
type RemoteQueueItem struct {
	UploadID    string
	TrackID     string
	Title       string
	Artist      string
	Album       string
	AlbumArtist string
	AlbumArt    string
	DurationMs  int64
	SongURI     string
	AlbumURI    string
	TrackNumber int
}

// EnqueueCommand is the payload of an `enqueue` command from a controller.
type EnqueueCommand struct {
	Tracks     []RemoteQueueItem
	Mode       string // "now" | "next" | "last"
	Shuffle    bool
	StartIndex int
}

// RemotePlayerHandlers are invoked when a controller sends a command. Any nil
// field is ignored.
type RemotePlayerHandlers struct {
	Play        func()
	Pause       func()
	Next        func()
	Previous    func()
	Seek        func(positionMs int64)
	Enqueue     func(cmd EnqueueCommand)
	QueueJump   func(index int)
	QueueRemove func(index int)
}

// RemotePlayerOptions configures a RemotePlayer.
type RemotePlayerOptions struct {
	// Token is the Rocksky access token. Required.
	Token string
	// Name is the display label shown in the miniplayer device picker. Required.
	Name string
	// URL overrides the endpoint (default DefaultRemoteWS).
	URL string
	// Heartbeat interval (default 10s).
	Heartbeat time.Duration
	// Reconnect delay after a drop (default 3s).
	Reconnect time.Duration
	// Handlers for incoming commands.
	Handlers RemotePlayerHandlers
}

// RemotePlayer is a Rocksky-controllable player: it registers as a device,
// advertises what you're playing, and invokes your handlers on commands. See
// remote-ws/PROTOCOL.md. Construct with NewRemotePlayer and drive with Run.
//
//	p := rocksky.NewRemotePlayer(rocksky.RemotePlayerOptions{
//	    Token: token, Name: "My Player",
//	    Handlers: rocksky.RemotePlayerHandlers{
//	        Play:  func() { engine.Play() },
//	        Pause: func() { engine.Pause() },
//	        Next:  func() { engine.Next() },
//	        Seek:  func(ms int64) { engine.Seek(ms) },
//	    },
//	})
//	go p.Run(ctx)
//	p.SetNowPlaying(rocksky.RemoteNowPlaying{Title: "…", Artist: "…", IsPlaying: true})
type RemotePlayer struct {
	opts RemotePlayerOptions

	mu       sync.Mutex
	conn     *websocket.Conn
	deviceID string

	lastTrack  *RemoteNowPlaying
	lastStatus *int
	lastQueue  *queueSnapshot
}

type queueSnapshot struct {
	items []RemoteQueueItem
	index int
}

// NewRemotePlayer creates a player. Call Run to connect.
func NewRemotePlayer(opts RemotePlayerOptions) *RemotePlayer {
	if opts.URL == "" {
		opts.URL = DefaultRemoteWS
	}
	if opts.Heartbeat == 0 {
		opts.Heartbeat = 10 * time.Second
	}
	if opts.Reconnect == 0 {
		opts.Reconnect = 3 * time.Second
	}
	return &RemotePlayer{opts: opts}
}

// DeviceID returns the server-assigned device id (empty until registered).
func (p *RemotePlayer) DeviceID() string {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.deviceID
}

// Run connects, registers, and maintains the session (heartbeat + auto-reconnect)
// until ctx is cancelled. It blocks; run it in a goroutine.
func (p *RemotePlayer) Run(ctx context.Context) error {
	for ctx.Err() == nil {
		p.session(ctx)
		sleep(ctx, p.opts.Reconnect)
	}
	return ctx.Err()
}

func (p *RemotePlayer) session(ctx context.Context) {
	conn, _, err := websocket.Dial(ctx, p.opts.URL, nil)
	if err != nil {
		return
	}
	conn.SetReadLimit(4 << 20)
	defer conn.Close(websocket.StatusNormalClosure, "")

	p.mu.Lock()
	p.conn = conn
	p.deviceID = ""
	p.mu.Unlock()
	defer func() {
		p.mu.Lock()
		if p.conn == conn {
			p.conn = nil
			p.deviceID = ""
		}
		p.mu.Unlock()
	}()

	// Register.
	if err := p.write(ctx, map[string]any{
		"type":       "register",
		"clientName": p.opts.Name,
		"token":      p.opts.Token,
	}); err != nil {
		return
	}

	// Heartbeat until this session's ctx is cancelled.
	hbCtx, cancel := context.WithCancel(ctx)
	defer cancel()
	go p.heartbeat(hbCtx, conn)

	for ctx.Err() == nil {
		_, data, err := conn.Read(ctx)
		if err != nil {
			return
		}
		if string(data) == "pong" {
			continue
		}
		p.handle(ctx, data)
	}
}

func (p *RemotePlayer) heartbeat(ctx context.Context, conn *websocket.Conn) {
	t := time.NewTicker(p.opts.Heartbeat)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			wctx, cancel := context.WithTimeout(ctx, 5*time.Second)
			err := conn.Write(wctx, websocket.MessageText, []byte("ping"))
			cancel()
			if err != nil {
				return
			}
		}
	}
}

// ── State push ────────────────────────────────────────────────────────────────

// SetNowPlaying advertises the current track. Call on change and periodically
// (~every 1–4s) with a fresh ElapsedMs so controllers show smooth progress.
func (p *RemotePlayer) SetNowPlaying(t RemoteNowPlaying) {
	p.mu.Lock()
	p.lastTrack = &t
	p.mu.Unlock()
	p.sendData(map[string]any{
		"type":         "track",
		"title":        t.Title,
		"artist":       t.Artist,
		"album":        t.Album,
		"album_artist": orStr(t.AlbumArtist, t.Artist),
		"length":       t.DurationMs,
		"elapsed":      t.ElapsedMs,
		"duration_ms":  t.DurationMs,
		"album_art":    t.AlbumArt,
		"is_playing":   t.IsPlaying,
		"device_name":  p.opts.Name,
	})
}

// SetStatus advertises transport state: "playing", "paused", or "stopped".
func (p *RemotePlayer) SetStatus(status string) {
	code := 0
	switch status {
	case "playing":
		code = 1
	case "paused":
		code = 2
	}
	p.mu.Lock()
	p.lastStatus = &code
	p.mu.Unlock()
	p.sendData(map[string]any{"type": "status", "status": code})
}

// SetQueue advertises the playback queue and current index.
func (p *RemotePlayer) SetQueue(items []RemoteQueueItem, index int) {
	p.mu.Lock()
	p.lastQueue = &queueSnapshot{items: items, index: index}
	p.mu.Unlock()
	p.sendData(map[string]any{
		"type":  "queue",
		"index": index,
		"queue": queueItemsJSON(items),
	})
}

// ── Internals ───────────────────────────────────────────────────────────────

func (p *RemotePlayer) sendData(data any) {
	p.mu.Lock()
	conn, id := p.conn, p.deviceID
	p.mu.Unlock()
	if conn == nil {
		return // dropped; resync happens on reconnect
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = p.writeConn(ctx, conn, map[string]any{
		"type":      "message",
		"device_id": id,
		"token":     p.opts.Token,
		"data":      data,
	})
}

func (p *RemotePlayer) write(ctx context.Context, payload any) error {
	p.mu.Lock()
	conn := p.conn
	p.mu.Unlock()
	if conn == nil {
		return nil
	}
	return p.writeConn(ctx, conn, payload)
}

// writeConn serializes writes (coder/websocket forbids concurrent Write).
func (p *RemotePlayer) writeConn(ctx context.Context, conn *websocket.Conn, payload any) error {
	b, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	return conn.Write(ctx, websocket.MessageText, b)
}

type wsInbound struct {
	Type     string          `json:"type"`
	Status   string          `json:"status"`
	DeviceID string          `json:"deviceId"`
	Action   string          `json:"action"`
	Args     json.RawMessage `json:"args"`
}

func (p *RemotePlayer) handle(ctx context.Context, data []byte) {
	var msg wsInbound
	if json.Unmarshal(data, &msg) != nil {
		return
	}
	// Capture our device id ONLY from the registration reply. Never from
	// device_registered (it carries another device's id) — see PROTOCOL.md.
	if msg.Status == "registered" && msg.DeviceID != "" {
		p.mu.Lock()
		p.deviceID = msg.DeviceID
		p.mu.Unlock()
		p.resync()
		return
	}
	if msg.Type == "command" {
		p.dispatch(msg)
	}
}

func (p *RemotePlayer) dispatch(msg wsInbound) {
	h := p.opts.Handlers
	switch msg.Action {
	case "play":
		call(h.Play)
	case "pause":
		call(h.Pause)
	case "next":
		call(h.Next)
	case "previous":
		call(h.Previous)
	case "seek":
		if h.Seek != nil {
			h.Seek(parseSeek(msg.Args))
		}
	case "queue_jump":
		if h.QueueJump != nil {
			h.QueueJump(parseIndex(msg.Args))
		}
	case "queue_remove":
		if h.QueueRemove != nil {
			h.QueueRemove(parseIndex(msg.Args))
		}
	case "enqueue":
		if h.Enqueue != nil {
			h.Enqueue(parseEnqueue(msg.Args))
		}
	}
}

// resync re-advertises the last known state after a (re)connect.
func (p *RemotePlayer) resync() {
	p.mu.Lock()
	t, s, q := p.lastTrack, p.lastStatus, p.lastQueue
	p.mu.Unlock()
	if t != nil {
		p.SetNowPlaying(*t)
	}
	if s != nil {
		p.sendData(map[string]any{"type": "status", "status": *s})
	}
	if q != nil {
		p.SetQueue(q.items, q.index)
	}
}

// ── arg parsing / helpers ─────────────────────────────────────────────────────

func parseSeek(raw json.RawMessage) int64 {
	var obj struct {
		Position int64 `json:"position"`
	}
	if json.Unmarshal(raw, &obj) == nil && obj.Position != 0 {
		return obj.Position
	}
	var n int64
	if json.Unmarshal(raw, &n) == nil {
		return n
	}
	return 0
}

func parseIndex(raw json.RawMessage) int {
	var obj struct {
		Index int `json:"index"`
	}
	_ = json.Unmarshal(raw, &obj)
	return obj.Index
}

type descriptorJSON struct {
	UploadID    string `json:"uploadId"`
	TrackID     string `json:"trackId"`
	Title       string `json:"title"`
	Artist      string `json:"artist"`
	Album       string `json:"album"`
	AlbumArtist string `json:"album_artist"`
	AlbumArt    string `json:"album_art"`
	Duration    int64  `json:"duration"`
	SongURI     string `json:"song_uri"`
	AlbumURI    string `json:"album_uri"`
	TrackNumber int    `json:"track_number"`
}

func parseEnqueue(raw json.RawMessage) EnqueueCommand {
	var obj struct {
		Tracks     []descriptorJSON `json:"tracks"`
		Mode       string           `json:"mode"`
		Shuffle    bool             `json:"shuffle"`
		StartIndex int              `json:"startIndex"`
	}
	_ = json.Unmarshal(raw, &obj)
	items := make([]RemoteQueueItem, 0, len(obj.Tracks))
	for _, d := range obj.Tracks {
		items = append(items, RemoteQueueItem{
			UploadID: d.UploadID, TrackID: d.TrackID, Title: d.Title, Artist: d.Artist,
			Album: d.Album, AlbumArtist: d.AlbumArtist, AlbumArt: d.AlbumArt,
			DurationMs: d.Duration, SongURI: d.SongURI, AlbumURI: d.AlbumURI,
			TrackNumber: d.TrackNumber,
		})
	}
	mode := obj.Mode
	if mode == "" {
		mode = "now"
	}
	return EnqueueCommand{Tracks: items, Mode: mode, Shuffle: obj.Shuffle, StartIndex: obj.StartIndex}
}

func queueItemsJSON(items []RemoteQueueItem) []map[string]any {
	out := make([]map[string]any, 0, len(items))
	for _, t := range items {
		out = append(out, map[string]any{
			"uploadId":     t.UploadID,
			"trackId":      t.TrackID,
			"title":        t.Title,
			"artist":       t.Artist,
			"album":        t.Album,
			"album_artist": t.AlbumArtist,
			"album_art":    t.AlbumArt,
			"duration":     t.DurationMs,
			"song_uri":     t.SongURI,
			"album_uri":    t.AlbumURI,
			"track_number": t.TrackNumber,
		})
	}
	return out
}

func call(f func()) {
	if f != nil {
		f()
	}
}

func orStr(a, b string) string {
	if a != "" {
		return a
	}
	return b
}
