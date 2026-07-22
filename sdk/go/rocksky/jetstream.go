package rocksky

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"
)

// DefaultJetstreamServers are the four public Bluesky Jetstream servers.
var DefaultJetstreamServers = []string{
	"wss://jetstream1.us-east.bsky.network",
	"wss://jetstream2.us-east.bsky.network",
	"wss://jetstream1.us-west.bsky.network",
	"wss://jetstream2.us-west.bsky.network",
}

// reconnectSlackUS is subtracted from the watermark when reconnecting so we
// re-read a few seconds of overlap rather than risk skipping an event.
const reconnectSlackUS = 5_000_000

type jetEvent struct {
	Did    string     `json:"did"`
	TimeUS int64      `json:"time_us"`
	Kind   string     `json:"kind"`
	Commit *jetCommit `json:"commit"`
}

type jetCommit struct {
	Operation  string                 `json:"operation"`
	Collection string                 `json:"collection"`
	Rkey       string                 `json:"rkey"`
	Record     map[string]interface{} `json:"record"`
}

// HydrateFromJetstream keeps the dedup index live from the Bluesky Jetstream
// firehose, filtered to this account's DID and app.rocksky.*, connecting to
// every server in servers at once (defaults to [DefaultJetstreamServers]). A
// shared watermark de-duplicates the overlap between servers and is the
// reconnect cursor (persisted in the index). Blocks until ctx is cancelled;
// each source reconnects with backoff. Requires an attached index.
func (a *Agent) HydrateFromJetstream(ctx context.Context, servers ...string) error {
	if a.idx == nil {
		return fmt.Errorf("no dedup index attached (call UseIndex)")
	}
	if len(servers) == 0 {
		servers = DefaultJetstreamServers
	}
	start, _ := a.idx.Cursor(a.did)
	wm := &watermark{v: start}

	var wg sync.WaitGroup
	for _, srv := range servers {
		wg.Add(1)
		go func(srv string) {
			defer wg.Done()
			a.jetLoop(ctx, srv, wm)
		}(srv)
	}
	wg.Wait()
	return ctx.Err()
}

type watermark struct {
	mu sync.Mutex
	v  int64
}

// claim advances the watermark to t if t is newer, returning whether this
// caller won the claim (i.e. should process the event).
func (w *watermark) claim(t int64) bool {
	w.mu.Lock()
	defer w.mu.Unlock()
	if t <= w.v {
		return false
	}
	w.v = t
	return true
}

func (w *watermark) load() int64 {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.v
}

func (a *Agent) jetLoop(ctx context.Context, server string, wm *watermark) {
	for ctx.Err() == nil {
		cursor := wm.load() - reconnectSlackUS
		if cursor < 0 {
			cursor = 0
		}
		u := buildSubscribeURL(server, a.did, cursor)

		conn, _, err := websocket.Dial(ctx, u, nil)
		if err != nil {
			sleep(ctx, 2*time.Second)
			continue
		}
		conn.SetReadLimit(16 << 20) // records can be large (lyrics, etc.)

		for ctx.Err() == nil {
			_, data, err := conn.Read(ctx)
			if err != nil {
				break
			}
			var ev jetEvent
			if json.Unmarshal(data, &ev) != nil {
				continue
			}
			if ev.Kind != "commit" || ev.Did != a.did || ev.Commit == nil {
				continue
			}
			if !wm.claim(ev.TimeUS) {
				continue // already processed by another server
			}
			_ = a.idx.applyCommit(ev.Did, ev.Commit.Collection, ev.Commit.Operation, ev.Commit.Rkey, ev.Commit.Record)
			_ = a.idx.SetCursor(a.did, ev.TimeUS)
		}
		conn.Close(websocket.StatusNormalClosure, "")
		sleep(ctx, 2*time.Second)
	}
}

func buildSubscribeURL(server, did string, cursorUS int64) string {
	q := url.Values{}
	q.Set("wantedCollections", "app.rocksky.*")
	q.Set("wantedDids", did)
	if cursorUS > 0 {
		q.Set("cursor", strconv.FormatInt(cursorUS, 10))
	}
	return strings.TrimRight(server, "/") + "/subscribe?" + q.Encode()
}

func sleep(ctx context.Context, d time.Duration) {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
	case <-t.C:
	}
}
