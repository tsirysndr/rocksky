package rocksky

import (
	"context"
	"encoding/json"
	"sync"
	"time"

	"github.com/coder/websocket"
)

// RemoteDevice is a player device visible to a controller (from the device
// snapshot).
type RemoteDevice struct {
	DeviceID   string
	Name       string
	NowPlaying *RemoteNowPlaying
	QueueIndex int
	Queue      []RemoteQueueItem
}

// RemoteControllerHandlers are invoked as the server pushes updates. Any nil
// field is ignored.
type RemoteControllerHandlers struct {
	// Devices is the full snapshot, sent on connect + reconnect.
	Devices            func(primaryDevice string, devices []RemoteDevice)
	DeviceRegistered   func(deviceID, name string)
	DeviceUnregistered func(deviceID string)
	PrimaryChanged     func(deviceID string)
	NowPlaying         func(deviceID, deviceName string, track RemoteNowPlaying)
	Status             func(deviceID, deviceName, status string)
	Queue              func(deviceID, deviceName string, index int, queue []RemoteQueueItem)
}

// RemoteControllerOptions configures a RemoteController.
type RemoteControllerOptions struct {
	// Token is the Rocksky access token. Required.
	Token string
	// Name is a registration label (controllers are hidden from device lists).
	Name string
	// URL overrides the endpoint (default DefaultRemoteWS).
	URL string
	// Heartbeat interval (default 10s).
	Heartbeat time.Duration
	// Reconnect delay after a drop (default 3s).
	Reconnect time.Duration
	// Handlers for incoming updates.
	Handlers RemoteControllerHandlers
}

// RemoteController is a Rocksky remote UI: it lists the user's players, observes
// what they're playing, picks the primary device, and sends commands. See
// remote-ws/PROTOCOL.md. Construct with NewRemoteController and drive with Run.
//
//	c := rocksky.NewRemoteController(rocksky.RemoteControllerOptions{
//	    Token: token, Name: "My Controller",
//	    Handlers: rocksky.RemoteControllerHandlers{
//	        Devices:    func(primary string, ds []rocksky.RemoteDevice) { render(ds) },
//	        NowPlaying: func(id, name string, t rocksky.RemoteNowPlaying) { show(id, t) },
//	    },
//	})
//	go c.Run(ctx)
//	c.SetPrimary(deviceID)
//	c.Pause(deviceID)
type RemoteController struct {
	opts RemoteControllerOptions

	mu   sync.Mutex
	conn *websocket.Conn
}

// NewRemoteController creates a controller. Call Run to connect.
func NewRemoteController(opts RemoteControllerOptions) *RemoteController {
	if opts.URL == "" {
		opts.URL = DefaultRemoteWS
	}
	if opts.Heartbeat == 0 {
		opts.Heartbeat = 10 * time.Second
	}
	if opts.Reconnect == 0 {
		opts.Reconnect = 3 * time.Second
	}
	return &RemoteController{opts: opts}
}

// Run connects, registers, and maintains the session (heartbeat + auto-reconnect)
// until ctx is cancelled. It blocks; run it in a goroutine.
func (c *RemoteController) Run(ctx context.Context) error {
	for ctx.Err() == nil {
		c.session(ctx)
		sleep(ctx, c.opts.Reconnect)
	}
	return ctx.Err()
}

func (c *RemoteController) session(ctx context.Context) {
	conn, _, err := websocket.Dial(ctx, c.opts.URL, nil)
	if err != nil {
		return
	}
	conn.SetReadLimit(4 << 20)
	defer conn.Close(websocket.StatusNormalClosure, "")

	c.mu.Lock()
	c.conn = conn
	c.mu.Unlock()
	defer func() {
		c.mu.Lock()
		if c.conn == conn {
			c.conn = nil
		}
		c.mu.Unlock()
	}()

	// Register (controllers register too; they're hidden from device lists).
	if err := c.writeConn(ctx, conn, map[string]any{
		"type":       "register",
		"clientName": c.opts.Name,
		"token":      c.opts.Token,
	}); err != nil {
		return
	}

	hbCtx, cancel := context.WithCancel(ctx)
	defer cancel()
	go c.heartbeat(hbCtx, conn)

	for ctx.Err() == nil {
		_, data, err := conn.Read(ctx)
		if err != nil {
			return
		}
		if string(data) == "pong" {
			continue
		}
		c.handle(data)
	}
}

func (c *RemoteController) heartbeat(ctx context.Context, conn *websocket.Conn) {
	t := time.NewTicker(c.opts.Heartbeat)
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

// ── Controls ──────────────────────────────────────────────────────────────────

// SetPrimary chooses the primary (scrobble/profile) device.
func (c *RemoteController) SetPrimary(deviceID string) {
	c.send(map[string]any{
		"type":      "set_primary",
		"device_id": deviceID,
		"token":     c.opts.Token,
	})
}

// Play sends a play command. target is a device id, or "" to broadcast to all
// the user's devices.
func (c *RemoteController) Play(target string) { c.command("play", target, nil) }

// Pause sends a pause command ("" target = broadcast).
func (c *RemoteController) Pause(target string) { c.command("pause", target, nil) }

// Next sends a next command ("" target = broadcast).
func (c *RemoteController) Next(target string) { c.command("next", target, nil) }

// Previous sends a previous command ("" target = broadcast).
func (c *RemoteController) Previous(target string) { c.command("previous", target, nil) }

// Seek seeks the target device to positionMs ("" target = broadcast).
func (c *RemoteController) Seek(target string, positionMs int64) {
	c.command("seek", target, map[string]any{"position": positionMs})
}

// QueueJump jumps to index in the target device's queue ("" target = broadcast).
func (c *RemoteController) QueueJump(target string, index int) {
	c.command("queue_jump", target, map[string]any{"index": index})
}

// QueueRemove removes queue item index on the target device ("" = broadcast).
func (c *RemoteController) QueueRemove(target string, index int) {
	c.command("queue_remove", target, map[string]any{"index": index})
}

// Enqueue enqueues tracks on the target device. mode is "now" | "next" | "last".
func (c *RemoteController) Enqueue(target string, tracks []RemoteQueueItem, mode string, shuffle bool, startIndex int) {
	if mode == "" {
		mode = "now"
	}
	c.command("enqueue", target, map[string]any{
		"tracks":     queueItemsJSON(tracks),
		"mode":       mode,
		"shuffle":    shuffle,
		"startIndex": startIndex,
	})
}

// Command sends an arbitrary command (escape hatch).
func (c *RemoteController) command(action, target string, args any) {
	payload := map[string]any{"type": "command", "action": action, "token": c.opts.Token}
	if target != "" {
		payload["target"] = target
	}
	if args != nil {
		payload["args"] = args
	}
	c.send(payload)
}

// ── Internals ───────────────────────────────────────────────────────────────

func (c *RemoteController) send(payload any) {
	c.mu.Lock()
	conn := c.conn
	c.mu.Unlock()
	if conn == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = c.writeConn(ctx, conn, payload)
}

// writeConn serializes writes (coder/websocket forbids concurrent Write).
func (c *RemoteController) writeConn(ctx context.Context, conn *websocket.Conn, payload any) error {
	b, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	return conn.Write(ctx, websocket.MessageText, b)
}

type ctlInbound struct {
	Type          string          `json:"type"`
	Status        string          `json:"status"`
	DeviceID      string          `json:"device_id"`
	DeviceName    string          `json:"device_name"`
	NewDeviceID   string          `json:"deviceId"`
	ClientName    string          `json:"clientName"`
	PrimaryDevice *string         `json:"primary_device"`
	Devices       []deviceJSON    `json:"devices"`
	Data          json.RawMessage `json:"data"`
}

type deviceJSON struct {
	DeviceID   string             `json:"device_id"`
	Name       string             `json:"name"`
	NowPlaying *trackJSON         `json:"now_playing"`
	Queue      *queueSnapshotJSON `json:"queue"`
}

type queueSnapshotJSON struct {
	Index int              `json:"index"`
	Queue []descriptorJSON `json:"queue"`
}

type trackJSON struct {
	Title       string `json:"title"`
	Artist      string `json:"artist"`
	Album       string `json:"album"`
	AlbumArtist string `json:"album_artist"`
	AlbumArt    string `json:"album_art"`
	DurationMs  int64  `json:"duration_ms"`
	Length      int64  `json:"length"`
	Elapsed     int64  `json:"elapsed"`
	IsPlaying   bool   `json:"is_playing"`
	Codec       string `json:"codec"`
	SampleRate  int    `json:"sample_rate"`
}

func (t trackJSON) toNowPlaying() RemoteNowPlaying {
	dur := t.DurationMs
	if dur == 0 {
		dur = t.Length
	}
	return RemoteNowPlaying{
		Title: t.Title, Artist: t.Artist, Album: t.Album, AlbumArtist: t.AlbumArtist,
		AlbumArt: t.AlbumArt, DurationMs: dur, ElapsedMs: t.Elapsed, IsPlaying: t.IsPlaying,
		Codec: t.Codec, SampleRate: t.SampleRate,
	}
}

func (d descriptorJSON) toItem() RemoteQueueItem {
	return RemoteQueueItem{
		UploadID: d.UploadID, TrackID: d.TrackID, Title: d.Title, Artist: d.Artist,
		Album: d.Album, AlbumArtist: d.AlbumArtist, AlbumArt: d.AlbumArt,
		DurationMs: d.Duration, SongURI: d.SongURI, AlbumURI: d.AlbumURI,
		TrackNumber: d.TrackNumber,
	}
}

func itemsFromJSON(ds []descriptorJSON) []RemoteQueueItem {
	items := make([]RemoteQueueItem, 0, len(ds))
	for _, d := range ds {
		items = append(items, d.toItem())
	}
	return items
}

func (c *RemoteController) handle(data []byte) {
	var msg ctlInbound
	if json.Unmarshal(data, &msg) != nil {
		return
	}
	// The registration reply carries no event (a controller doesn't need its own
	// id to control other devices).
	if msg.Status == "registered" {
		return
	}
	h := c.opts.Handlers
	switch msg.Type {
	case "devices":
		if h.Devices != nil {
			devices := make([]RemoteDevice, 0, len(msg.Devices))
			for _, d := range msg.Devices {
				dev := RemoteDevice{DeviceID: d.DeviceID, Name: d.Name}
				if d.NowPlaying != nil {
					np := d.NowPlaying.toNowPlaying()
					dev.NowPlaying = &np
				}
				if d.Queue != nil {
					dev.QueueIndex = d.Queue.Index
					dev.Queue = itemsFromJSON(d.Queue.Queue)
				}
				devices = append(devices, dev)
			}
			primary := ""
			if msg.PrimaryDevice != nil {
				primary = *msg.PrimaryDevice
			}
			h.Devices(primary, devices)
		}
	case "device_registered":
		if h.DeviceRegistered != nil {
			h.DeviceRegistered(msg.NewDeviceID, msg.ClientName)
		}
	case "device_unregistered":
		if h.DeviceUnregistered != nil {
			h.DeviceUnregistered(msg.DeviceID)
		}
	case "primary_changed":
		if h.PrimaryChanged != nil {
			h.PrimaryChanged(msg.DeviceID)
		}
	case "message":
		c.handleMessage(msg)
	}
}

func (c *RemoteController) handleMessage(msg ctlInbound) {
	h := c.opts.Handlers
	var dataType struct {
		Type string `json:"type"`
	}
	if json.Unmarshal(msg.Data, &dataType) != nil {
		return
	}
	switch dataType.Type {
	case "track":
		if h.NowPlaying != nil {
			var t trackJSON
			_ = json.Unmarshal(msg.Data, &t)
			h.NowPlaying(msg.DeviceID, msg.DeviceName, t.toNowPlaying())
		}
	case "status":
		if h.Status != nil {
			var s struct {
				Status int `json:"status"`
			}
			_ = json.Unmarshal(msg.Data, &s)
			h.Status(msg.DeviceID, msg.DeviceName, statusString(s.Status))
		}
	case "queue":
		if h.Queue != nil {
			var q queueSnapshotJSON
			_ = json.Unmarshal(msg.Data, &q)
			h.Queue(msg.DeviceID, msg.DeviceName, q.Index, itemsFromJSON(q.Queue))
		}
	}
}

func statusString(code int) string {
	switch code {
	case 1:
		return "playing"
	case 0:
		return "stopped"
	default:
		return "paused"
	}
}
